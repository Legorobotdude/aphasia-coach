"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Brain, LogOut } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { auth } from "@/lib/firebaseClient";
import { signOut } from "firebase/auth";

export function Navbar() {
  const pathname = usePathname();
  const { user, loading } = useAuth();
  const [authError, setAuthError] = React.useState<string | null>(null);
  
  // Clear any URL parameters if they're causing issues
  React.useEffect(() => {
    if (window.location.href.includes('redirect_to=')) {
      try {
        // Clear the URL parameters without reloading the page
        window.history.replaceState({}, document.title, window.location.pathname);
        
        // Also clear any redirect cookies
        fetch('/api/auth/clear-redirect')
          .catch(error => console.error('Failed to clear redirect cookie:', error));
      } catch (error) {
        console.error('Failed to clean URL:', error);
      }
    }
  }, []);
  
  const isActive = (path: string) => {
    // Get pathname without query parameters
    const currentPath = pathname.split('?')[0];
    
    if (path === '/' && currentPath === '/') return true;
    if (path !== '/' && currentPath.startsWith(path)) return true;
    return false;
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      // After signing out, redirect to home page
      window.location.href = '/';
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 max-w-screen-2xl items-center">
        <div className="mr-4 flex">
          <Link href="/" className="flex items-center space-x-2">
            <Brain className="h-6 w-6" />
            <span className="font-semibold">Aphasia Coach</span>
          </Link>
        </div>

        {/* Show nav links only when authenticated */}
        {user && (
          <nav className="flex items-center space-x-6 text-sm font-medium">
            <Link
              href="/"
              className={cn(
                "transition-colors hover:text-foreground/80",
                isActive("/") ? "text-foreground" : "text-foreground/60",
              )}
            >
              Home
            </Link>
            <Link
              href="/dashboard"
              className={cn(
                "transition-colors hover:text-foreground/80",
                isActive("/dashboard")
                  ? "text-foreground"
                  : "text-foreground/60",
              )}
            >
              Dashboard
            </Link>
            <Link
              href="/session"
              className={cn(
                "transition-colors hover:text-foreground/80",
                isActive("/session") ? "text-foreground" : "text-foreground/60",
              )}
            >
              Practice Session
            </Link>
          </nav>
        )}

        <div className="ml-auto flex items-center space-x-4">
          {!loading && (
            <>
              {user ? (
                <div className="flex items-center gap-4">
                  {user.photoURL && (
                    <img
                      src={user.photoURL}
                      alt="User profile"
                      className="h-8 w-8 rounded-full"
                    />
                  )}
                  <span className="text-sm hidden md:inline-block">
                    {user.displayName || user.email}
                  </span>
                  <button
                    onClick={handleSignOut}
                    className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground h-9 px-3"
                  >
                    <LogOut className="h-4 w-4" />
                    <span className="sr-only md:not-sr-only md:ml-2">
                      Sign out
                    </span>
                  </button>
                </div>
              ) : (
                <Link
                  href="/#login"
                  className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground shadow hover:bg-primary/90 h-9 px-4 py-2"
                >
                  Sign In
                </Link>
              )}
            </>
          )}
        </div>
      </div>
    </header>
  );
}
