#include "cuttledoc_gemma_mlx_adapter.h"

#include "mlx/backend/metal/metal.h"
#include "mlx/io.h"
#include "mlx/memory.h"
#include "mlx/mlx.h"

#include <algorithm>
#include <atomic>
#include <cmath>
#include <cstddef>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <filesystem>
#include <limits>
#include <memory>
#include <mutex>
#include <optional>
#include <stdexcept>
#include <string>
#include <unordered_map>
#include <utility>
#include <vector>

namespace mx = mlx::core;

namespace {

constexpr std::size_t kVocabularySize = 262'144;
constexpr std::size_t kHiddenSize = 2'816;
constexpr std::size_t kLayerCount = 30;
constexpr std::size_t kAttentionHeads = 16;
constexpr std::size_t kSlidingKeyValueHeads = 8;
constexpr std::size_t kGlobalKeyValueHeads = 2;
constexpr std::size_t kSlidingHeadDimension = 256;
constexpr std::size_t kGlobalHeadDimension = 512;
constexpr std::size_t kSlidingWindow = 1'024;
constexpr std::size_t kExpertCount = 128;
constexpr std::size_t kSelectedExpertCount = 8;
constexpr std::size_t kCacheStep = 256;
constexpr float kRmsNormEpsilon = 1e-6f;
constexpr float kFinalLogitSoftcap = 30.0f;
constexpr std::size_t kExpectedTensorCount = 1'339;
constexpr std::size_t kExpectedBfloat16Count = 1'013;
constexpr std::size_t kExpectedUint32Count = 326;
constexpr std::uintmax_t kShard1Bytes = 5'320'218'487;
constexpr std::uintmax_t kShard2Bytes = 5'363'328'422;
constexpr std::uintmax_t kShard3Bytes = 4'657'658'867;

std::mutex runtime_mutex;
std::optional<mx::Stream> runtime_stream;
std::optional<std::string> configured_metallib_path;

class CancelledError : public std::runtime_error {
public:
  using std::runtime_error::runtime_error;
};

class CallbackError : public std::runtime_error {
public:
  using std::runtime_error::runtime_error;
};

char *copy_string(const std::string &value) {
  auto *copy = static_cast<char *>(std::malloc(value.size() + 1));
  if (copy != nullptr) {
    std::memcpy(copy, value.c_str(), value.size() + 1);
  }
  return copy;
}

int32_t fail(int32_t status, const std::string &message, char **error_output) {
  if (error_output != nullptr) {
    *error_output = copy_string(message);
  }
  return status;
}

bool is_global_layer(std::size_t layer) {
  return (layer + 1) % 6 == 0;
}

bool is_stop_token(int32_t token) {
  return token == 1 || token == 50 || token == 106;
}

std::string layer_prefix(std::size_t layer) {
  return "language_model.model.layers." + std::to_string(layer) + ".";
}

std::string shape_string(const mx::array &value) {
  std::string result = "[";
  for (std::size_t index = 0; index < value.ndim(); ++index) {
    if (index != 0) {
      result += ",";
    }
    result += std::to_string(value.shape(static_cast<int>(index)));
  }
  result += "]";
  return result;
}

void expect_shape(const std::unordered_map<std::string, mx::array> &weights,
                  const std::string &name, const mx::Shape &expected) {
  const auto found = weights.find(name);
  if (found == weights.end()) {
    throw std::runtime_error("missing Gemma tensor: " + name);
  }
  if (found->second.shape() != expected) {
    throw std::runtime_error("Gemma tensor " + name + " has shape " +
                             shape_string(found->second));
  }
}

void expect_quantized(
    const std::unordered_map<std::string, mx::array> &weights,
    const std::string &prefix, const mx::Shape &weight_shape,
    const mx::Shape &parameter_shape) {
  expect_shape(weights, prefix + ".weight", weight_shape);
  expect_shape(weights, prefix + ".scales", parameter_shape);
  expect_shape(weights, prefix + ".biases", parameter_shape);
}

class FullKeyValueCache {
public:
  std::size_t offset() const { return offset_; }

  std::pair<mx::array, mx::array> update(const mx::array &keys,
                                         const mx::array &values,
                                         const mx::Stream &stream) {
    const auto previous = offset_;
    const auto input_length = static_cast<std::size_t>(keys.shape(2));
    if (!keys_.has_value() ||
        previous + input_length >
            static_cast<std::size_t>(keys_->shape(2))) {
      const auto steps = (kCacheStep + input_length - 1) / kCacheStep;
      const auto capacity = steps * kCacheStep;
      auto new_keys =
          mx::zeros({keys.shape(0), keys.shape(1), static_cast<int>(capacity),
                     keys.shape(3)},
                    keys.dtype(), stream);
      auto new_values = mx::zeros(
          {values.shape(0), values.shape(1), static_cast<int>(capacity),
           values.shape(3)},
          values.dtype(), stream);
      if (keys_.has_value()) {
        if (previous % kCacheStep != 0) {
          keys_ = mx::slice(keys_.value(), {0, 0, 0, 0},
                            {keys_->shape(0), keys_->shape(1),
                             static_cast<int>(previous), keys_->shape(3)},
                            {1, 1, 1, 1}, stream);
          values_ = mx::slice(values_.value(), {0, 0, 0, 0},
                              {values_->shape(0), values_->shape(1),
                               static_cast<int>(previous), values_->shape(3)},
                              {1, 1, 1, 1}, stream);
        }
        keys_ = mx::concatenate({keys_.value(), std::move(new_keys)}, 2,
                                stream);
        values_ = mx::concatenate({values_.value(), std::move(new_values)}, 2,
                                  stream);
      } else {
        keys_ = std::move(new_keys);
        values_ = std::move(new_values);
      }
    }

    offset_ += input_length;
    keys_ = mx::slice_update(
        keys_.value(), keys, {0, 0, static_cast<int>(previous), 0},
        {keys.shape(0), keys.shape(1), static_cast<int>(offset_),
         keys.shape(3)},
        stream);
    values_ = mx::slice_update(
        values_.value(), values, {0, 0, static_cast<int>(previous), 0},
        {values.shape(0), values.shape(1), static_cast<int>(offset_),
         values.shape(3)},
        stream);
    return {
        mx::slice(keys_.value(), {0, 0, 0, 0},
                  {keys_->shape(0), keys_->shape(1),
                   static_cast<int>(offset_), keys_->shape(3)},
                  {1, 1, 1, 1}, stream),
        mx::slice(values_.value(), {0, 0, 0, 0},
                  {values_->shape(0), values_->shape(1),
                   static_cast<int>(offset_), values_->shape(3)},
                  {1, 1, 1, 1}, stream),
    };
  }

  void append_arrays(std::vector<mx::array> &arrays,
                     const mx::Stream &stream) const {
    if (!keys_.has_value()) {
      return;
    }
    arrays.push_back(mx::slice(
        keys_.value(), {0, 0, 0, 0},
        {keys_->shape(0), keys_->shape(1), static_cast<int>(offset_),
         keys_->shape(3)},
        {1, 1, 1, 1}, stream));
    arrays.push_back(mx::slice(
        values_.value(), {0, 0, 0, 0},
        {values_->shape(0), values_->shape(1), static_cast<int>(offset_),
         values_->shape(3)},
        {1, 1, 1, 1}, stream));
  }

private:
  std::optional<mx::array> keys_;
  std::optional<mx::array> values_;
  std::size_t offset_ = 0;
};

class SlidingKeyValueCache {
public:
  std::size_t offset() const { return offset_; }

  std::pair<mx::array, mx::array> update(const mx::array &keys,
                                         const mx::array &values,
                                         const mx::Stream &stream) {
    const auto input_length = static_cast<std::size_t>(keys.shape(2));
    offset_ += input_length;
    if (!keys_.has_value()) {
      const auto returned_keys = keys;
      const auto returned_values = values;
      keys_ = last_window(keys, stream);
      values_ = last_window(values, stream);
      return {returned_keys, returned_values};
    }

    keys_ = last_window(
        mx::concatenate({keys_.value(), keys}, 2, stream), stream);
    values_ = last_window(
        mx::concatenate({values_.value(), values}, 2, stream), stream);
    return {keys_.value(), values_.value()};
  }

  void append_arrays(std::vector<mx::array> &arrays) const {
    if (keys_.has_value()) {
      arrays.push_back(keys_.value());
      arrays.push_back(values_.value());
    }
  }

private:
  mx::array last_window(const mx::array &value,
                        const mx::Stream &stream) const {
    const auto length = static_cast<std::size_t>(value.shape(2));
    if (length <= kSlidingWindow) {
      return value;
    }
    const auto begin = static_cast<int>(length - kSlidingWindow);
    return mx::slice(value, {0, 0, begin, 0}, value.shape(),
                     {1, 1, 1, 1}, stream);
  }

  std::optional<mx::array> keys_;
  std::optional<mx::array> values_;
  std::size_t offset_ = 0;
};

struct LayerCache {
  explicit LayerCache(bool global) : global(global) {}

  std::size_t offset() const {
    return global ? full.offset() : sliding.offset();
  }

  std::pair<mx::array, mx::array> update(const mx::array &keys,
                                         const mx::array &values,
                                         const mx::Stream &stream) {
    return global ? full.update(keys, values, stream)
                  : sliding.update(keys, values, stream);
  }

  void append_arrays(std::vector<mx::array> &arrays,
                     const mx::Stream &stream) const {
    if (global) {
      full.append_arrays(arrays, stream);
    } else {
      sliding.append_arrays(arrays);
    }
  }

  bool global;
  FullKeyValueCache full;
  SlidingKeyValueCache sliding;
};

class GemmaSession {
public:
  explicit GemmaSession(const std::filesystem::path &model_directory)
      : stream_(runtime_stream.value()) {
    load_weights(model_directory);
    validate_weights();
    std::vector<mx::array> materialized;
    materialized.reserve(weights_.size());
    for (const auto &[name, value] : weights_) {
      (void)name;
      materialized.push_back(value);
    }
    mx::eval(std::move(materialized));
  }

  int32_t generate(const uint32_t *prompt_tokens,
                   std::size_t prompt_token_count, uint32_t maximum_tokens,
                   cuttledoc_gemma_mlx_token_callback token_callback,
                   cuttledoc_gemma_mlx_cancel_callback cancel_callback,
                   void *callback_context) const {
    if (prompt_tokens == nullptr || prompt_token_count == 0 ||
        maximum_tokens == 0 || token_callback == nullptr) {
      throw std::invalid_argument("invalid Gemma generation arguments");
    }
    std::vector<int32_t> current_tokens;
    current_tokens.reserve(prompt_token_count);
    for (std::size_t index = 0; index < prompt_token_count; ++index) {
      if (prompt_tokens[index] >= kVocabularySize) {
        throw std::invalid_argument("Gemma prompt token is outside the vocabulary");
      }
      current_tokens.push_back(static_cast<int32_t>(prompt_tokens[index]));
    }
    if (current_tokens.front() != 2) {
      throw std::invalid_argument("Gemma prompt must begin with BOS");
    }

    std::vector<LayerCache> caches;
    caches.reserve(kLayerCount);
    for (std::size_t layer = 0; layer < kLayerCount; ++layer) {
      caches.emplace_back(is_global_layer(layer));
    }

    for (uint32_t generated = 0; generated < maximum_tokens; ++generated) {
      check_cancelled(cancel_callback, callback_context);
      const auto token = next_token(current_tokens, caches);
      check_cancelled(cancel_callback, callback_context);
      if (is_stop_token(token)) {
        mx::clear_cache();
        return CUTTLEDOC_GEMMA_MLX_FINISH_STOP;
      }
      if (token_callback(callback_context, static_cast<uint32_t>(token)) != 0) {
        throw CallbackError("Gemma token callback rejected an update");
      }
      current_tokens.assign(1, token);
    }
    mx::clear_cache();
    return CUTTLEDOC_GEMMA_MLX_FINISH_LENGTH;
  }

private:
  void load_weights(const std::filesystem::path &model_directory) {
    const std::vector<std::pair<std::string, std::uintmax_t>> shards{
        {"model-00001-of-00003.safetensors", kShard1Bytes},
        {"model-00002-of-00003.safetensors", kShard2Bytes},
        {"model-00003-of-00003.safetensors", kShard3Bytes},
    };
    for (const auto &[name, expected_bytes] : shards) {
      const auto path = model_directory / name;
      if (!std::filesystem::is_regular_file(path) ||
          std::filesystem::file_size(path) != expected_bytes) {
        throw std::runtime_error("invalid Gemma shard: " + path.string());
      }
      auto [loaded, metadata] =
          mx::load_safetensors(path.string(), mx::Device::cpu);
      (void)metadata;
      for (auto &[tensor_name, value] : loaded) {
        if (tensor_name.starts_with("language_model.model.")) {
          const auto inserted =
              weights_.emplace(std::move(tensor_name), std::move(value));
          if (!inserted.second) {
            throw std::runtime_error("duplicate Gemma tensor");
          }
        }
      }
    }
  }

  void validate_weights() const {
    if (weights_.size() != kExpectedTensorCount) {
      throw std::runtime_error("Gemma language tensor count mismatch");
    }
    std::size_t bfloat16_count = 0;
    std::size_t uint32_count = 0;
    for (const auto &[name, value] : weights_) {
      if (value.dtype() == mx::bfloat16) {
        ++bfloat16_count;
      } else if (value.dtype() == mx::uint32) {
        ++uint32_count;
      } else {
        throw std::runtime_error("unexpected Gemma tensor dtype: " + name);
      }
    }
    if (bfloat16_count != kExpectedBfloat16Count ||
        uint32_count != kExpectedUint32Count) {
      throw std::runtime_error("Gemma tensor dtype counts mismatch");
    }

    expect_quantized(weights_, "language_model.model.embed_tokens",
                     {262144, 352}, {262144, 44});
    expect_shape(weights_, "language_model.model.norm.weight", {2816});
    for (std::size_t layer = 0; layer < kLayerCount; ++layer) {
      const auto prefix = layer_prefix(layer);
      const bool global = is_global_layer(layer);
      const int head_dimension =
          static_cast<int>(global ? kGlobalHeadDimension
                                  : kSlidingHeadDimension);
      const int key_value_heads =
          static_cast<int>(global ? kGlobalKeyValueHeads
                                  : kSlidingKeyValueHeads);
      expect_quantized(
          weights_, prefix + "self_attn.q_proj",
          {static_cast<int>(kAttentionHeads) * head_dimension, 352},
          {static_cast<int>(kAttentionHeads) * head_dimension, 44});
      expect_quantized(
          weights_, prefix + "self_attn.k_proj",
          {key_value_heads * head_dimension, 352},
          {key_value_heads * head_dimension, 44});
      if (!global) {
        expect_quantized(
            weights_, prefix + "self_attn.v_proj",
            {key_value_heads * head_dimension, 352},
            {key_value_heads * head_dimension, 44});
      }
      expect_quantized(
          weights_, prefix + "self_attn.o_proj",
          {2816, static_cast<int>(kAttentionHeads) * head_dimension / 8},
          {2816, static_cast<int>(kAttentionHeads) * head_dimension / 64});
      expect_shape(weights_, prefix + "self_attn.q_norm.weight",
                   {head_dimension});
      expect_shape(weights_, prefix + "self_attn.k_norm.weight",
                   {head_dimension});
      for (const auto *name :
           {"input_layernorm.weight", "post_attention_layernorm.weight",
            "pre_feedforward_layernorm.weight",
            "pre_feedforward_layernorm_2.weight",
            "post_feedforward_layernorm.weight",
            "post_feedforward_layernorm_1.weight",
            "post_feedforward_layernorm_2.weight"}) {
        expect_shape(weights_, prefix + name, {2816});
      }
      expect_shape(weights_, prefix + "layer_scalar", {1});
      expect_quantized(weights_, prefix + "mlp.gate_proj", {2112, 352},
                       {2112, 44});
      expect_quantized(weights_, prefix + "mlp.up_proj", {2112, 352},
                       {2112, 44});
      expect_quantized(weights_, prefix + "mlp.down_proj", {2816, 264},
                       {2816, 33});
      expect_shape(weights_, prefix + "router.scale", {2816});
      expect_shape(weights_, prefix + "router.per_expert_scale", {128});
      expect_quantized(weights_, prefix + "router.proj", {128, 704},
                       {128, 44});
      expect_quantized(weights_, prefix + "experts.switch_glu.gate_proj",
                       {128, 704, 352}, {128, 704, 44});
      expect_quantized(weights_, prefix + "experts.switch_glu.up_proj",
                       {128, 704, 352}, {128, 704, 44});
      expect_quantized(weights_, prefix + "experts.switch_glu.down_proj",
                       {128, 2816, 88}, {128, 2816, 11});
    }
  }

  const mx::array &weight(const std::string &name) const {
    const auto found = weights_.find(name);
    if (found == weights_.end()) {
      throw std::runtime_error("missing Gemma weight: " + name);
    }
    return found->second;
  }

  mx::array quantized_linear(const mx::array &input,
                             const std::string &prefix,
                             int bits = 4) const {
    return mx::quantized_matmul(
        input, weight(prefix + ".weight"), weight(prefix + ".scales"),
        weight(prefix + ".biases"), true, 64, bits, "affine", stream_);
  }

  mx::array quantized_expert_linear(const mx::array &input,
                                    const mx::array &indices,
                                    const std::string &prefix) const {
    return mx::gather_qmm(
        input, weight(prefix + ".weight"), weight(prefix + ".scales"),
        weight(prefix + ".biases"), std::nullopt, indices, true, 64, 4,
        "affine", false, stream_);
  }

  mx::array rms_norm(const mx::array &input,
                     const std::string &weight_name) const {
    return mx::fast::rms_norm(input, weight(weight_name), kRmsNormEpsilon,
                              stream_);
  }

  mx::array gelu_approx(const mx::array &input) const {
    const auto x3 = input * input * input;
    const auto inner =
        std::sqrt(2.0f / static_cast<float>(M_PI)) *
        (input + 0.044715f * x3);
    return 0.5f * input * (1.0f + mx::tanh(inner, stream_));
  }

  mx::array sliding_mask(std::size_t sequence_length,
                         mx::Dtype dtype) const {
    std::vector<float> values(sequence_length * sequence_length, 0.0f);
    for (std::size_t row = 0; row < sequence_length; ++row) {
      const auto first =
          row + 1 > kSlidingWindow ? row + 1 - kSlidingWindow : 0;
      for (std::size_t column = 0; column < sequence_length; ++column) {
        if (column < first || column > row) {
          values[row * sequence_length + column] = -1e9f;
        }
      }
    }
    return mx::astype(
        mx::array(values.begin(),
                  {static_cast<int>(sequence_length),
                   static_cast<int>(sequence_length)}),
        dtype, stream_);
  }

  mx::array apply_rope(const mx::array &input, bool global,
                       std::size_t offset) const {
    if (!global) {
      return mx::fast::rope(
          input, static_cast<int>(kSlidingHeadDimension), false, 10'000.0f,
          1.0f, static_cast<int>(offset), std::nullopt, stream_);
    }
    std::vector<float> frequencies(kGlobalHeadDimension / 2,
                                   std::numeric_limits<float>::infinity());
    constexpr std::size_t rotated_dimensions =
        kGlobalHeadDimension / 4;
    for (std::size_t index = 0; index < rotated_dimensions / 2; ++index) {
      frequencies[index] =
          std::pow(1'000'000.0f,
                   static_cast<float>(2 * index) /
                       static_cast<float>(kGlobalHeadDimension));
    }
    const auto frequency_array =
        mx::array(frequencies.begin(),
                  {static_cast<int>(frequencies.size())});
    return mx::fast::rope(
        input, static_cast<int>(kGlobalHeadDimension), false, std::nullopt,
        1.0f, static_cast<int>(offset), frequency_array, stream_);
  }

  mx::array attention(const mx::array &input, std::size_t layer,
                      LayerCache &cache) const {
    const auto prefix = layer_prefix(layer) + "self_attn.";
    const bool global = is_global_layer(layer);
    const int head_dimension =
        static_cast<int>(global ? kGlobalHeadDimension
                                : kSlidingHeadDimension);
    const int key_value_heads =
        static_cast<int>(global ? kGlobalKeyValueHeads
                                : kSlidingKeyValueHeads);
    const int batch_size = input.shape(0);
    const int sequence_length = input.shape(1);

    auto queries = mx::reshape(
        quantized_linear(input, prefix + "q_proj"),
        {batch_size, sequence_length, static_cast<int>(kAttentionHeads),
         head_dimension},
        stream_);
    auto raw_keys = mx::reshape(
        quantized_linear(input, prefix + "k_proj"),
        {batch_size, sequence_length, key_value_heads, head_dimension},
        stream_);
    auto raw_values =
        global ? raw_keys
               : mx::reshape(
                     quantized_linear(input, prefix + "v_proj"),
                     {batch_size, sequence_length, key_value_heads,
                      head_dimension},
                     stream_);
    queries = rms_norm(queries, prefix + "q_norm.weight");
    auto keys = rms_norm(raw_keys, prefix + "k_norm.weight");
    auto values =
        mx::fast::rms_norm(raw_values, std::nullopt, kRmsNormEpsilon, stream_);
    queries = mx::transpose(queries, {0, 2, 1, 3}, stream_);
    keys = mx::transpose(keys, {0, 2, 1, 3}, stream_);
    values = mx::transpose(values, {0, 2, 1, 3}, stream_);

    const auto offset = cache.offset();
    queries = apply_rope(queries, global, offset);
    keys = apply_rope(keys, global, offset);
    auto [cached_keys, cached_values] = cache.update(keys, values, stream_);

    std::string mask_mode;
    std::optional<mx::array> mask;
    if (sequence_length > 1) {
      if (global) {
        mask_mode = "causal";
      } else {
        mask = sliding_mask(static_cast<std::size_t>(sequence_length),
                            queries.dtype());
      }
    }
    auto output = mx::fast::scaled_dot_product_attention(
        queries, cached_keys, cached_values, 1.0f, mask_mode, mask,
        std::nullopt, stream_);
    output = mx::reshape(
        mx::transpose(output, {0, 2, 1, 3}, stream_),
        {batch_size, sequence_length,
         static_cast<int>(kAttentionHeads) * head_dimension},
        stream_);
    return quantized_linear(output, prefix + "o_proj");
  }

  mx::array dense_mlp(const mx::array &input,
                      const std::string &prefix) const {
    const auto gate = quantized_linear(input, prefix + "gate_proj");
    const auto up = quantized_linear(input, prefix + "up_proj");
    return quantized_linear(gelu_approx(gate) * up, prefix + "down_proj");
  }

  mx::array experts(const mx::array &input, const mx::array &indices,
                    const std::string &prefix) const {
    const auto expanded = mx::expand_dims(input, {-2, -3}, stream_);
    const auto up =
        quantized_expert_linear(expanded, indices, prefix + "up_proj");
    const auto gate =
        quantized_expert_linear(expanded, indices, prefix + "gate_proj");
    const auto hidden = gelu_approx(gate) * up;
    auto output =
        quantized_expert_linear(hidden, indices, prefix + "down_proj");
    output = mx::squeeze(output, -2, stream_);
    return output;
  }

  std::pair<mx::array, mx::array>
  route(const mx::array &input, const std::string &prefix) const {
    const auto root_size =
        1.0f / std::sqrt(static_cast<float>(kHiddenSize));
    const auto scale = weight(prefix + "scale") * root_size;
    const auto normalized =
        mx::fast::rms_norm(input, scale, kRmsNormEpsilon, stream_);
    const auto scores =
        quantized_linear(normalized, prefix + "proj", 8);
    auto indices = mx::argpartition(
        scores, -static_cast<int>(kSelectedExpertCount), -1, stream_);
    indices = mx::slice(
        indices,
        {0, 0, static_cast<int>(kExpertCount - kSelectedExpertCount)},
        indices.shape(), {1, 1, 1}, stream_);
    auto selected = mx::take_along_axis(scores, indices, -1, stream_);
    auto probabilities = mx::softmax(selected, -1, false, stream_);
    probabilities =
        probabilities *
        mx::take(weight(prefix + "per_expert_scale"), indices, 0, stream_);
    return {indices, probabilities};
  }

  mx::array decoder_layer(const mx::array &input, std::size_t layer,
                          LayerCache &cache) const {
    const auto prefix = layer_prefix(layer);
    auto hidden =
        rms_norm(input, prefix + "input_layernorm.weight");
    hidden = attention(hidden, layer, cache);
    hidden = rms_norm(hidden, prefix + "post_attention_layernorm.weight");
    hidden = input + hidden;

    const auto residual = hidden;
    auto dense = rms_norm(hidden, prefix + "pre_feedforward_layernorm.weight");
    dense = dense_mlp(dense, prefix + "mlp.");
    dense =
        rms_norm(dense, prefix + "post_feedforward_layernorm_1.weight");

    auto [indices, probabilities] = route(hidden, prefix + "router.");
    auto sparse =
        rms_norm(hidden, prefix + "pre_feedforward_layernorm_2.weight");
    sparse = experts(sparse, indices, prefix + "experts.switch_glu.");
    sparse = mx::sum(
        mx::expand_dims(probabilities, -1, stream_) * sparse, -2, false,
        stream_);
    sparse =
        rms_norm(sparse, prefix + "post_feedforward_layernorm_2.weight");

    hidden = rms_norm(dense + sparse,
                      prefix + "post_feedforward_layernorm.weight");
    hidden = residual + hidden;
    return hidden * weight(prefix + "layer_scalar");
  }

  mx::array embed(const std::vector<int32_t> &tokens) const {
    const auto token_array =
        mx::array(tokens.begin(), {1, static_cast<int>(tokens.size())});
    auto hidden = mx::dequantize(
        mx::take(weight("language_model.model.embed_tokens.weight"),
                 token_array, 0, stream_),
        mx::take(weight("language_model.model.embed_tokens.scales"),
                 token_array, 0, stream_),
        mx::take(weight("language_model.model.embed_tokens.biases"),
                 token_array, 0, stream_),
        64, 4, "affine", std::nullopt, std::nullopt, stream_);
    return hidden * std::sqrt(static_cast<float>(kHiddenSize));
  }

  int32_t next_token(const std::vector<int32_t> &tokens,
                     std::vector<LayerCache> &caches) const {
    auto hidden = embed(tokens);
    for (std::size_t layer = 0; layer < kLayerCount; ++layer) {
      hidden = decoder_layer(hidden, layer, caches[layer]);
    }
    hidden =
        rms_norm(hidden, "language_model.model.norm.weight");
    const auto last =
        mx::take(hidden, hidden.shape(1) - 1, 1, stream_);
    auto logits = quantized_linear(
        last, "language_model.model.embed_tokens");
    logits = mx::tanh(logits / kFinalLogitSoftcap, stream_) *
             kFinalLogitSoftcap;
    auto token = mx::argmax(logits, -1, false, stream_);
    std::vector<mx::array> materialized;
    materialized.reserve(1 + caches.size() * 2);
    materialized.push_back(token);
    for (const auto &cache : caches) {
      cache.append_arrays(materialized, stream_);
    }
    mx::eval(std::move(materialized));
    return token.item<int32_t>();
  }

  static void check_cancelled(
      cuttledoc_gemma_mlx_cancel_callback cancel_callback,
      void *callback_context) {
    if (cancel_callback != nullptr &&
        cancel_callback(callback_context) != 0) {
      throw CancelledError("Gemma generation was cancelled");
    }
  }

  mx::Stream stream_;
  std::unordered_map<std::string, mx::array> weights_;
};

void configure_runtime(const std::filesystem::path &metallib_path) {
  if (!std::filesystem::is_regular_file(metallib_path)) {
    throw std::runtime_error("MLX metallib is missing: " +
                             metallib_path.string());
  }
  const auto canonical = std::filesystem::canonical(metallib_path).string();
  if (configured_metallib_path.has_value() &&
      configured_metallib_path.value() != canonical) {
    throw std::runtime_error(
        "the process already initialized MLX with another metallib");
  }
  if (!configured_metallib_path.has_value()) {
    mx::metal::set_metallib_path(canonical);
    configured_metallib_path = canonical;
    runtime_stream = mx::new_thread_unsafe_stream(mx::Device::gpu);
    mx::set_cache_limit(1ULL * 1'024 * 1'024 * 1'024);
  }
}

} // namespace

extern "C" uint32_t cuttledoc_gemma_mlx_abi_version(void) {
  return CUTTLEDOC_GEMMA_MLX_ABI_VERSION;
}

extern "C" void *cuttledoc_gemma_mlx_session_create(
    const char *model_directory, const char *metallib_path,
    int32_t *status_output, char **error_output) {
  if (status_output != nullptr) {
    *status_output = CUTTLEDOC_GEMMA_MLX_LOAD_FAILED;
  }
  if (error_output != nullptr) {
    *error_output = nullptr;
  }
  if (model_directory == nullptr || metallib_path == nullptr) {
    fail(CUTTLEDOC_GEMMA_MLX_INVALID_INPUT,
         "Gemma model and metallib paths are required", error_output);
    if (status_output != nullptr) {
      *status_output = CUTTLEDOC_GEMMA_MLX_INVALID_INPUT;
    }
    return nullptr;
  }
  try {
    std::lock_guard<std::mutex> lock(runtime_mutex);
    configure_runtime(metallib_path);
    auto session =
        std::make_unique<GemmaSession>(std::filesystem::path(model_directory));
    if (status_output != nullptr) {
      *status_output = CUTTLEDOC_GEMMA_MLX_OK;
    }
    return session.release();
  } catch (const std::exception &error) {
    fail(CUTTLEDOC_GEMMA_MLX_LOAD_FAILED, error.what(), error_output);
    return nullptr;
  } catch (...) {
    fail(CUTTLEDOC_GEMMA_MLX_LOAD_FAILED,
         "unknown Gemma session creation failure", error_output);
    return nullptr;
  }
}

extern "C" int32_t cuttledoc_gemma_mlx_session_generate(
    void *handle, const uint32_t *prompt_tokens, size_t prompt_token_count,
    uint32_t maximum_tokens,
    cuttledoc_gemma_mlx_token_callback token_callback,
    cuttledoc_gemma_mlx_cancel_callback cancel_callback,
    void *callback_context, int32_t *finish_reason_output,
    char **error_output) {
  if (error_output != nullptr) {
    *error_output = nullptr;
  }
  if (handle == nullptr || finish_reason_output == nullptr) {
    return fail(CUTTLEDOC_GEMMA_MLX_INVALID_INPUT,
                "invalid Gemma session arguments", error_output);
  }
  std::unique_lock<std::mutex> lock(runtime_mutex, std::try_to_lock);
  if (!lock.owns_lock()) {
    return fail(CUTTLEDOC_GEMMA_MLX_BUSY,
                "another MLX task is active in this process", error_output);
  }
  try {
    auto *session = static_cast<GemmaSession *>(handle);
    *finish_reason_output = session->generate(
        prompt_tokens, prompt_token_count, maximum_tokens, token_callback,
        cancel_callback, callback_context);
    return CUTTLEDOC_GEMMA_MLX_OK;
  } catch (const CancelledError &error) {
    mx::clear_cache();
    return fail(CUTTLEDOC_GEMMA_MLX_CANCELLED, error.what(), error_output);
  } catch (const CallbackError &error) {
    mx::clear_cache();
    return fail(CUTTLEDOC_GEMMA_MLX_GENERATION_FAILED, error.what(),
                error_output);
  } catch (const std::invalid_argument &error) {
    mx::clear_cache();
    return fail(CUTTLEDOC_GEMMA_MLX_INVALID_INPUT, error.what(), error_output);
  } catch (const std::exception &error) {
    mx::clear_cache();
    return fail(CUTTLEDOC_GEMMA_MLX_GENERATION_FAILED, error.what(),
                error_output);
  } catch (...) {
    mx::clear_cache();
    return fail(CUTTLEDOC_GEMMA_MLX_GENERATION_FAILED,
                "unknown Gemma generation failure", error_output);
  }
}

extern "C" void cuttledoc_gemma_mlx_session_destroy(void *handle) {
  if (handle == nullptr) {
    return;
  }
  std::lock_guard<std::mutex> lock(runtime_mutex);
  delete static_cast<GemmaSession *>(handle);
  mx::clear_cache();
}

extern "C" void cuttledoc_gemma_mlx_free_string(char *value) {
  std::free(value);
}
