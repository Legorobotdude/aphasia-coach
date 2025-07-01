"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Brain, LogOut } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { auth } from "@/lib/firebaseClient";
import { signOut } from "firebase/auth";
import Image from "next/image";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Menu } from "lucide-react";

export function Navbar() {
  const pathname = usePathname();
  const { user, loading } = useAuth();

  // Clear any URL parameters if they're causing issues
  React.useEffect(() => {
    if (window.location.href.includes("redirect_to=")) {
      try {
        // Clear the URL parameters without reloading the page
        window.history.replaceState(
          {},
          document.title,
          window.location.pathname,
        );

        // Also clear any redirect cookies
        fetch("/api/auth/clear-redirect").catch((error) =>
          console.error("Failed to clear redirect cookie:", error),
        );
      } catch (error) {
        console.error("Failed to clean URL:", error);
      }
    }
  }, []);

  const isActive = (path: string) => {
    // Get pathname without query parameters
    const currentPath = pathname.split("?")[0];

    if (path === "/" && currentPath === "/") return true;
    if (path !== "/" && currentPath.startsWith(path)) return true;
    return false;
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      // After signing out, redirect to home page
      window.location.href = "/";
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 max-w-screen-2xl items-center px-6">
        <div className="mr-8 flex pl-2">
          <Link href="/" className="flex items-center space-x-3">
            <Brain className="h-6 w-6" />
            <span className="font-semibold">Aphasia Coach</span>
          </Link>
        </div>

        {/* Desktop nav links */}
        {user && (
          <nav className="hidden md:flex items-center space-x-6 text-sm font-medium">
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

        {/* Mobile Hamburger Menu */}
        <div className="flex md:hidden ml-auto pr-2">
          <Sheet>
            <SheetTrigger asChild>
              <button
                aria-label="Open navigation menu"
                className="inline-flex items-center justify-center rounded-md p-2 text-foreground hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <Menu className="h-6 w-6" />
              </button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72 p-0">
              <SheetHeader className="p-6 pb-2 border-b border-border">
                <SheetTitle>
                  <Link href="/" className="flex items-center space-x-2">
                    <Brain className="h-6 w-6" />
                    <span className="font-semibold">Aphasia Coach</span>
                  </Link>
                </SheetTitle>
              </SheetHeader>
              <nav className="flex flex-col gap-2 p-6">
                {user && (
                  <>
                    <Link
                      href="/"
                      className={cn(
                        "py-2 px-2 rounded hover:bg-accent text-base font-medium transition-colors",
                        isActive("/")
                          ? "bg-accent text-foreground"
                          : "text-foreground/80",
                      )}
                    >
                      Home
                    </Link>
                    <Link
                      href="/dashboard"
                      className={cn(
                        "py-2 px-2 rounded hover:bg-accent text-base font-medium transition-colors",
                        isActive("/dashboard")
                          ? "bg-accent text-foreground"
                          : "text-foreground/80",
                      )}
                    >
                      Dashboard
                    </Link>
                    <Link
                      href="/session"
                      className={cn(
                        "py-2 px-2 rounded hover:bg-accent text-base font-medium transition-colors",
                        isActive("/session")
                          ? "bg-accent text-foreground"
                          : "text-foreground/80",
                      )}
                    >
                      Practice Session
                    </Link>
                  </>
                )}
                <div className="mt-4 border-t border-border pt-4 flex flex-col gap-4">
                  {!loading &&
                    (user ? (
                      <div className="flex items-center gap-3">
                        {user.photoURL && (
                          <Image
                            src={user.photoURL}
                            alt="User profile"
                            width={40}
                            height={40}
                            className="h-10 w-10 rounded-full"
                          />
                        )}
                        <span className="text-base font-medium truncate max-w-[120px]">
                          {user.displayName || user.email}
                        </span>
                        <button
                          onClick={handleSignOut}
                          className="ml-auto flex items-center gap-2 px-3 py-2 rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90 text-sm font-medium"
                        >
                          <LogOut className="h-4 w-4" />
                          Sign out
                        </button>
                      </div>
                    ) : (
                      <Link
                        href="/#login"
                        className="w-full flex items-center justify-center px-4 py-3 rounded-md bg-primary text-primary-foreground shadow hover:bg-primary/90 text-base font-medium"
                      >
                        Sign In
                      </Link>
                    ))}
                </div>
              </nav>
            </SheetContent>
          </Sheet>
        </div>

        {/* Desktop user actions */}
        <div className="ml-auto hidden md:flex items-center space-x-4 pr-2">
          {!loading && (
            <>
              {user ? (
                <div className="flex items-center gap-4">
                  {user.photoURL && (
                    <Image
                      src={user.photoURL}
                      alt="User profile"
                      width={32}
                      height={32}
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
