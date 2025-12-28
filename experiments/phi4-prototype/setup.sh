#!/bin/bash
# Setup script for Phi-4-multimodal prototype

set -e

echo "🚀 Setting up Phi-4-multimodal prototype..."

cd "$(dirname "$0")"

# Create virtual environment if not exists
if [ ! -d "venv" ]; then
    echo "📦 Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
source venv/bin/activate

# Upgrade pip
echo "📦 Upgrading pip..."
pip install --upgrade pip

# Install dependencies
echo "📦 Installing dependencies..."
pip install -r requirements.txt

echo ""
echo "✅ Setup complete!"
echo ""
echo "To use:"
echo "  source venv/bin/activate"
echo "  python transcribe.py <audio-file>"
echo ""
echo "Example with cuttledoc fixture:"
echo "  python transcribe.py ../../packages/cuttledoc/fixtures/fairytale-de.ogg"

