"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { getAuth, signInWithPopup, GoogleAuthProvider } from "firebase/auth";
import { getFirestoreInstance } from "@/lib/firebaseConfig";
import { doc, getDoc, setDoc } from "firebase/firestore";
import {
  MoveRight,
  PhoneCall,
  Brain,
  MessageSquare,
  Clock,
  TrendingUp,
  Shield,
  CheckCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { Grid } from "@/components/ui/grid";

export default function Home() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Ensure we're on the client side
      if (typeof window === "undefined") {
        throw new Error(
          "Authentication can only be performed on the client side",
        );
      }

      // Initialize Google Auth Provider
      const provider = new GoogleAuthProvider();

      // Get auth instance
      const auth = getAuth();
      if (!auth) {
        throw new Error("Firebase Auth is not initialized");
      }

      // Sign in with Google popup
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      if (!user) {
        throw new Error("Failed to authenticate");
      }

      // Get user's ID token
      const idToken = await user.getIdToken();

      // Send token to server to create session cookie
      const response = await fetch("/api/auth/session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ idToken }),
      });

      if (!response.ok) {
        throw new Error("Failed to create session");
      }

      // Check if user has completed onboarding
      const userRef = doc(getFirestoreInstance(), "users", user.uid);
      const userSnap = await getDoc(userRef);

      // Check for redirect cookie
      const getCookie = (name: string) => {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        if (parts.length === 2) return parts.pop()?.split(";").shift();
        return null;
      };

      const redirectPath = getCookie("redirectAfterLogin");

      // Clear the redirect cookie
      if (redirectPath) {
        document.cookie =
          "redirectAfterLogin=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;";
      }

      if (userSnap.exists() && userSnap.data().onboardComplete) {
        // Redirect to the intended destination if it exists, otherwise go to session page
        if (redirectPath) {
          router.push(redirectPath);
        } else {
          router.push("/session");
        }
      } else {
        // Create/update user document
        await setDoc(
          userRef,
          {
            fullName: user.displayName,
            email: user.email,
            lastLogin: new Date(),
            onboardComplete: false,
          },
          { merge: true },
        );

        // Always redirect to onboarding if not completed, regardless of intended destination
        router.push("/onboarding");
      }
    } catch (err) {
      console.error("Login error:", err);
      setError(err instanceof Error ? err.message : "Failed to log in");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="relative py-20 lg:py-32 bg-gradient-to-br from-background via-background to-primary/5">
        <div className="absolute inset-0 bg-grid-slate-900/[0.02] bg-[size:30px_30px]" />
        <div className="relative">
          <Hero />
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 lg:py-32 bg-background">
        <FeaturesSection />
      </section>

      {/* Benefits Section */}
      <section className="py-16 bg-muted/30">
        <BenefitsSection />
      </section>

      {/* CTA Section */}
      <section className="py-20 lg:py-32 bg-gradient-to-r from-primary/5 via-primary/10 to-primary/5">
        <Cta
          heading="Ready to Start Your Recovery Journey?"
          description="Join thousands of users who have improved their communication skills with Aphasia Coach. Begin your personalized therapy today."
          buttons={{
            primary: {
              text: "Start Free Trial",
              url: "#login",
            },
            secondary: {
              text: "Learn More",
              url: "#features",
            },
          }}
        />
      </section>

      {/* Login Section */}
      <section id="login" className="py-20 lg:py-32 bg-background">
        <div className="container mx-auto px-4 sm:px-8">
          <div className="max-w-md mx-auto">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold mb-4">Welcome Back</h2>
              <p className="text-lg text-muted-foreground">
                Sign in to continue your personalized therapy journey
              </p>
            </div>

            <Card className="p-8 shadow-xl border-2 border-primary/10">
              <Button
                onClick={handleLogin}
                disabled={isLoading}
                className="w-full py-4 px-6 text-lg font-medium"
                size="lg"
              >
                {isLoading ? (
                  <div className="flex items-center">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-3"></div>
                    Signing you in...
                  </div>
                ) : (
                  <>
                    <GoogleIcon className="mr-3 h-6 w-6" />
                    Sign in with Google
                  </>
                )}
              </Button>

              {error && (
                <div className="mt-6 p-4 bg-destructive/10 border border-destructive/20 text-destructive rounded-lg">
                  <div className="flex items-center">
                    <Shield className="h-5 w-5 mr-2" />
                    <span className="font-medium">Authentication Error</span>
                  </div>
                  <p className="mt-1 text-sm">{error}</p>
                </div>
              )}

              <div className="mt-6 pt-6 border-t border-border">
                <p className="text-sm text-muted-foreground text-center">
                  By signing in, you agree to our privacy-focused approach to
                  your therapy data.
                </p>
              </div>
            </Card>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 bg-muted/50 border-t border-border">
        <div className="container mx-auto px-4 sm:px-8">
          <div className="text-center">
            <div className="flex items-center justify-center mb-4">
              <Brain className="h-8 w-8 text-primary mr-3" />
              <span className="text-2xl font-bold">Aphasia Coach</span>
            </div>
            <p className="text-lg text-muted-foreground mb-4">
              Empowering communication recovery through personalized therapy
            </p>
            <p className="text-sm text-muted-foreground mb-6">
              &copy; {new Date().getFullYear()} Aphasia Coach. A revolutionary
              app designed to help individuals with aphasia improve their
              communication skills.
            </p>
            <div className="flex items-center justify-center">
              <Badge variant="outline" className="px-4 py-2">
                <span className="mr-2">🔓</span>
                Open Source Project
              </Badge>
              <span className="mx-3 text-muted-foreground">•</span>
              <a
                href="https://github.com/Legorobotdude/aphasia-coach"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:text-primary/80 transition-colors font-medium"
              >
                View on GitHub
              </a>
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}

// Hero Section
function Hero() {
  return (
    <div className="container mx-auto px-4 sm:px-8">
      <div className="grid grid-cols-1 gap-16 items-center lg:grid-cols-2">
        <div className="space-y-8">
          <div className="space-y-4">
            <Badge variant="outline" className="px-4 py-2 text-sm font-medium">
              <TrendingUp className="w-4 h-4 mr-2" />
              Proven Results
            </Badge>
            <h1 className="text-5xl lg:text-7xl font-bold tracking-tight">
              <span className="text-primary">Aphasia</span>{" "}
              <span className="text-foreground">Coach</span>
            </h1>
            <p className="text-xl lg:text-2xl leading-relaxed text-muted-foreground max-w-2xl">
              Rebuild your communication confidence with personalized speech
              therapy exercises designed specifically for aphasia recovery.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 w-full max-w-lg">
            <Button
              size="lg"
              className="flex-1 py-4 text-lg font-medium shadow-lg"
              asChild
            >
              <a href="#login">
                Start Your Journey <MoveRight className="w-5 h-5 ml-2" />
              </a>
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="flex-1 py-4 text-lg font-medium border-2"
              asChild
            >
              <a href="#features">
                Learn More <PhoneCall className="w-5 h-5 ml-2" />
              </a>
            </Button>
          </div>

          <div className="flex items-center space-x-6 text-sm text-muted-foreground">
            <div className="flex items-center">
              <CheckCircle className="w-5 h-5 text-green-500 mr-2" />
              Free to start
            </div>
            <div className="flex items-center">
              <CheckCircle className="w-5 h-5 text-green-500 mr-2" />
              Evidence-based
            </div>
            <div className="flex items-center">
              <CheckCircle className="w-5 h-5 text-green-500 mr-2" />
              Privacy-focused
            </div>
          </div>
        </div>

        <div className="relative">
          <div className="relative bg-gradient-to-br from-primary/10 via-primary/5 to-transparent rounded-3xl aspect-square flex items-center justify-center p-8 shadow-2xl">
            <Brain className="w-48 h-48 text-primary drop-shadow-lg" />
            <div className="absolute -top-4 -right-4 bg-green-500 text-white p-3 rounded-full shadow-lg">
              <TrendingUp className="w-6 h-6" />
            </div>
            <div className="absolute -bottom-4 -left-4 bg-blue-500 text-white p-3 rounded-full shadow-lg">
              <MessageSquare className="w-6 h-6" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Features Section
function FeaturesSection() {
  return (
    <div className="container mx-auto px-4 sm:px-8">
      <div className="text-center mb-20">
        <Badge variant="outline" className="mb-6 px-4 py-2">
          <Brain className="w-4 h-4 mr-2" />
          Designed for Recovery
        </Badge>
        <h2 className="text-4xl lg:text-6xl font-bold mb-6">
          Features That <span className="text-primary">Empower</span>
        </h2>
        <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
          Every feature is thoughtfully designed to support your unique recovery
          journey, providing the tools and confidence you need to improve
          communication.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
        {features.map((feature, index) => (
          <Card
            key={feature.title}
            className={cn(
              "relative p-8 border-2 hover:shadow-xl transition-all duration-300 group",
              index === 1 && "lg:scale-105 border-primary/20 shadow-lg",
            )}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-lg" />
            <Grid size={20} />

            <div className="relative z-10 space-y-4">
              <div className="p-3 bg-primary/10 rounded-xl w-fit">
                {feature.icon}
              </div>
              <h3 className="text-xl font-bold text-foreground">
                {feature.title}
              </h3>
              <p className="text-muted-foreground leading-relaxed">
                {feature.description}
              </p>
              <div className="pt-2">
                <span className="text-sm font-medium text-primary group-hover:underline">
                  Learn more →
                </span>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

// Benefits Section
function BenefitsSection() {
  const benefits = [
    {
      title: "Tailored to You",
      description:
        "Every exercise adapts to your specific type of aphasia and recovery stage",
      icon: Brain,
    },
    {
      title: "Practice Anytime",
      description:
        "Accessible therapy exercises available whenever you're ready to practice",
      icon: Clock,
    },
    {
      title: "Track Progress",
      description:
        "See your improvement over time with detailed progress insights",
      icon: TrendingUp,
    },
    {
      title: "Speech-Focused",
      description:
        "Specialized exercises designed specifically for communication recovery",
      icon: MessageSquare,
    },
  ];

  return (
    <div className="container mx-auto px-4 sm:px-8">
      <div className="text-center mb-12">
        <h2 className="text-3xl lg:text-4xl font-bold mb-4">
          Why Our <span className="text-primary">Personalized</span> Approach
          Works
        </h2>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          Every person's journey with aphasia is unique. Our approach adapts to
          your specific needs and recovery goals.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
        {benefits.map((benefit) => (
          <div key={benefit.title} className="text-center space-y-4">
            <div className="flex justify-center mb-4">
              <div className="p-4 bg-primary/10 rounded-2xl">
                <benefit.icon className="w-8 h-8 text-primary" />
              </div>
            </div>
            <h3 className="text-xl font-bold text-foreground">
              {benefit.title}
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {benefit.description}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

// Features data
const features = [
  {
    title: "Personalized Exercises",
    description:
      "AI-powered therapy plans tailored to your specific type of aphasia, recovery stage, and personal goals for maximum effectiveness.",
    icon: <Brain className="w-8 h-8 text-primary" />,
  },
  {
    title: "Real-time Feedback",
    description:
      "Instant, encouraging feedback on pronunciation, word choice, and sentence structure to accelerate your improvement journey.",
    icon: <MessageSquare className="w-8 h-8 text-primary" />,
  },
  {
    title: "Progress Tracking",
    description:
      "Comprehensive analytics and milestone celebrations to visualize your recovery progress and maintain motivation.",
    icon: <Clock className="w-8 h-8 text-primary" />,
  },
];

// Call to Action Section
interface CtaProps {
  heading: string;
  description: string;
  buttons?: {
    primary?: {
      text: string;
      url: string;
    };
    secondary?: {
      text: string;
      url: string;
    };
  };
}

const Cta = ({
  heading = "Ready to Start Your Recovery Journey?",
  description = "Join thousands of users who have improved their communication skills with Aphasia Coach.",
  buttons = {
    primary: {
      text: "Start Free Trial",
      url: "#",
    },
    secondary: {
      text: "Learn More",
      url: "#",
    },
  },
}: CtaProps) => {
  return (
    <div className="container mx-auto px-4 sm:px-8">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-primary/10 via-primary/5 to-primary/10 p-12 lg:p-20 shadow-2xl border border-primary/20">
        <div className="absolute inset-0 bg-grid-slate-900/[0.04] bg-[size:20px_20px]" />
        <div className="relative text-center">
          <h3 className="text-3xl lg:text-5xl font-bold mb-6">{heading}</h3>
          <p className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto leading-relaxed">
            {description}
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center max-w-md mx-auto">
            {buttons.primary && (
              <Button
                size="lg"
                asChild
                className="py-4 px-8 text-lg font-medium shadow-lg"
              >
                <a href={buttons.primary.url}>{buttons.primary.text}</a>
              </Button>
            )}
            {buttons.secondary && (
              <Button
                variant="outline"
                size="lg"
                asChild
                className="py-4 px-8 text-lg font-medium border-2"
              >
                <a href={buttons.secondary.url}>{buttons.secondary.text}</a>
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// Google Icon component for the sign-in button
const GoogleIcon = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    className={className}
    width="24"
    height="24"
  >
    <path
      fill="currentColor"
      d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"
    />
  </svg>
);
