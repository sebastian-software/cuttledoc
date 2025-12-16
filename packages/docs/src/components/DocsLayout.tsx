import { Menu, X } from "lucide-react";
import { useState } from "react";
import { Link, Outlet, useLocation } from "react-router";

import { cn } from "@/lib/utils";

interface NavItem {
  title: string;
  href: string;
  items?: NavItem[];
}

const navigation: NavItem[] = [
  {
    title: "Getting Started",
    href: "/docs/getting-started",
  },
  {
    title: "API Reference",
    href: "/docs/api",
    items: [
      { title: "transcribe", href: "/docs/api/transcribe" },
      { title: "Backends", href: "/docs/api/backends" },
      { title: "LLM Enhancement", href: "/docs/api/llm" },
    ],
  },
];

function Sidebar({ className }: { className?: string }) {
  const location = useLocation();

  return (
    <nav className={cn("space-y-1", className)}>
      {navigation.map((item) => (
        <div key={item.href}>
          <Link
            to={item.href}
            className={cn(
              "block px-3 py-2 rounded-md text-sm font-medium transition-colors",
              location.pathname === item.href
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            )}
          >
            {item.title}
          </Link>
          {item.items !== undefined && (
            <div className="ml-4 mt-1 space-y-1">
              {item.items.map((subItem) => (
                <Link
                  key={subItem.href}
                  to={subItem.href}
                  className={cn(
                    "block px-3 py-1.5 rounded-md text-sm transition-colors",
                    location.pathname === subItem.href
                      ? "text-primary font-medium"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {subItem.title}
                </Link>
              ))}
            </div>
          )}
        </div>
      ))}
    </nav>
  );
}

export function DocsLayout() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 max-w-screen-2xl items-center px-4">
          <button
            className="mr-4 md:hidden"
            onClick={() => {
              setIsSidebarOpen(!isSidebarOpen);
            }}
          >
            {isSidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <Link to="/" className="flex items-center space-x-2">
            <span className="text-xl">🦑</span>
            <span className="font-bold">cuttledoc</span>
          </Link>
          <div className="flex-1" />
          <nav className="flex items-center space-x-6 text-sm font-medium">
            <Link to="/docs" className="text-muted-foreground hover:text-foreground transition-colors">
              Docs
            </Link>
            <a
              href="https://github.com/yourusername/cuttledoc"
              className="text-muted-foreground hover:text-foreground transition-colors"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub
            </a>
          </nav>
        </div>
      </header>

      <div className="container max-w-screen-2xl flex-1 items-start md:grid md:grid-cols-[220px_minmax(0,1fr)] md:gap-6 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-10 px-4">
        {/* Sidebar */}
        <aside
          className={cn(
            "fixed top-14 z-30 -ml-4 h-[calc(100vh-3.5rem)] w-full shrink-0 overflow-y-auto border-r border-border md:sticky md:block",
            isSidebarOpen ? "block bg-background" : "hidden"
          )}
        >
          <div className="py-6 pr-6 pl-4 lg:py-8">
            <Sidebar />
          </div>
        </aside>

        {/* Main content */}
        <main className="py-6 lg:py-8">
          <div className="prose dark:prose-invert max-w-3xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

