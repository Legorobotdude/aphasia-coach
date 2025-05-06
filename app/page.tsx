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
  Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  Carousel,
  CarouselApi,
  CarouselContent,
  CarouselItem,
} from "@/components/ui/carousel";
import { Avatar, AvatarImage } from "@/components/ui/avatar";
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

      if (userSnap.exists() && userSnap.data().onboardComplete) {
        // Redirect to session page if onboarding is complete
        router.push("/session");
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

        // Redirect to onboarding flow
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
      <Hero />
      <FeaturesSection />
      {/* Patient testimonials section commented out to avoid potential legal issues
      <TestimonialSection 
        testimonials={testimonials}
        avatarPath="/images/testimonials/"
      />
      */}
      <Cta
        heading="Ready to Start Your Recovery Journey?"
        description="Join thousands of users who have improved their communication skills with Aphasia Coach."
        buttons={{
          primary: {
            text: "Sign In",
            url: "#login",
          },
          secondary: {
            text: "Learn More",
            url: "#features",
          },
        }}
      />

      <section id="login" className="py-24 bg-background">
        <div className="max-w-md mx-auto p-8 bg-card rounded-xl shadow-lg">
          <h2 className="text-2xl font-semibold mb-6 text-center">Sign In</h2>

          <p className="mb-8 text-center text-muted-foreground">
            Sign in to start your personalized therapy sessions or continue your
            progress
          </p>

          <Button
            onClick={handleLogin}
            disabled={isLoading}
            className="w-full py-3 px-4 flex items-center justify-center"
            size="lg"
          >
            {isLoading ? (
              <span className="mr-2">Loading...</span>
            ) : (
              <>
                <GoogleIcon className="mr-2 h-5 w-5" />
                Sign in with Google
              </>
            )}
          </Button>

          {error && (
            <div className="mt-4 p-3 bg-destructive/10 text-destructive rounded-md">
              {error}
            </div>
          )}
        </div>
      </section>

      <footer className="w-full py-12 bg-muted text-center text-sm text-muted-foreground">
        <div className="container mx-auto">
          <p>Aphasia Coach &copy; {new Date().getFullYear()}</p>
          <p className="mt-2">
            A revolutionary app designed to help individuals with aphasia
            improve their communication skills
          </p>
        </div>
      </footer>
    </main>
  );
}

// Hero Section
function Hero() {
  return (
    <div className="w-full py-16 lg:py-32">
      <div className="container mx-auto">
        <div className="grid grid-cols-1 gap-10 items-center lg:grid-cols-2">
          <div className="flex gap-5 flex-col">
            <div>
              <Badge variant="outline">New Release</Badge>
            </div>
            <div className="flex gap-5 flex-col">
              <h1 className="text-5xl md:text-7xl max-w-lg tracking-tighter text-left font-semibold">
                Aphasia Coach
              </h1>
              <p className="text-xl leading-relaxed tracking-tight text-muted-foreground max-w-lg text-left">
                Improve your communication skills through personalized speech
                exercises and progress tracking.
              </p>
            </div>
            <div className="flex flex-row gap-4">
              <Button size="lg" className="gap-4" variant="outline" asChild>
                <a href="#features">
                  Learn more <PhoneCall className="w-4 h-4" />
                </a>
              </Button>
              <Button size="lg" className="gap-4" asChild>
                <a href="#login">
                  Sign in <MoveRight className="w-4 h-4" />
                </a>
              </Button>
            </div>
          </div>
          <div className="bg-muted rounded-xl aspect-square flex items-center justify-center">
            <Brain className="w-36 h-36 text-primary/60" />
          </div>
        </div>
      </div>
    </div>
  );
}

// Features Section
function FeaturesSection() {
  return (
    <div id="features" className="py-24 lg:py-44 bg-background">
      <div className="container mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-5xl font-bold mb-4">Features</h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Designed to support your recovery with personalized exercises and
            progress tracking.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-10 md:gap-8 max-w-5xl mx-auto">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="relative bg-gradient-to-b from-zinc-100/30 to-zinc-300/30 p-8 rounded-3xl overflow-hidden"
            >
              <Grid size={20} />
              <div className="mb-4">{feature.icon}</div>
              <p className="text-base font-bold text-foreground relative z-20">
                {feature.title}
              </p>
              <p className="text-muted-foreground mt-4 text-base font-normal relative z-20">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Features data
const features = [
  {
    title: "Personalized Exercises",
    description:
      "Tailored speech and language exercises based on your specific type of aphasia and recovery goals.",
    icon: <Brain className="w-8 h-8 text-primary" />,
  },
  {
    title: "Real-time Feedback",
    description:
      "Receive immediate feedback on pronunciation, word choice, and sentence structure to accelerate improvement.",
    icon: <MessageSquare className="w-8 h-8 text-primary" />,
  },
  {
    title: "Progress Tracking",
    description:
      "Monitor your recovery journey with detailed analytics and progress reports to celebrate milestones.",
    icon: <Clock className="w-8 h-8 text-primary" />,
  },
  /* Expert-Designed feature commented out to avoid potential legal claims
  {
    title: "Expert-Designed",
    description:
      "Created in collaboration with speech therapists and neurologists to ensure evidence-based approaches.",
    icon: <Award className="w-8 h-8 text-primary" />,
  },
  */
];

// TestimonialSection Component
interface Testimonial {
  name: string;
  avatar: string;
  role: string;
  review: string;
  improvement: string;
  rating?: number;
}

interface TestimonialSectionProps extends React.HTMLAttributes<HTMLDivElement> {
  testimonials: Testimonial[];
  avatarPath?: string;
}

const TestimonialSection = React.forwardRef<
  HTMLDivElement,
  TestimonialSectionProps
>(({ className, testimonials, avatarPath = "", ...props }, ref) => {
  const [api, setApi] = React.useState<CarouselApi>();
  const [current, setCurrent] = React.useState(0);

  React.useEffect(() => {
    if (!api) return;
    api.on("select", () => {
      setCurrent(api.selectedScrollSnap());
    });
  }, [api]);

  return (
    <div ref={ref} className={cn("py-16 bg-background", className)} {...props}>
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold tracking-tight mb-2">
            Patient Success Stories
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Real stories from real people who have improved their communication
            skills with Aphasia Coach.
          </p>
        </div>

        <Carousel setApi={setApi} className="max-w-screen-xl mx-auto">
          <CarouselContent>
            {testimonials.map((testimonial) => (
              <CarouselItem
                key={testimonial.name}
                className="md:basis-1/2 lg:basis-1/3 p-2"
              >
                <Card className="h-full flex flex-col p-6 border bg-card">
                  <div className="flex items-center mb-4">
                    <Avatar className="h-12 w-12 mr-4">
                      <AvatarImage
                        src={`${avatarPath}${testimonial.avatar}`}
                        alt={testimonial.name}
                      />
                    </Avatar>
                    <div>
                      <h4 className="font-medium">{testimonial.name}</h4>
                      <p className="text-sm text-muted-foreground">
                        {testimonial.role}
                      </p>
                    </div>
                    {testimonial.rating && (
                      <div className="ml-auto flex">
                        {Array.from({ length: testimonial.rating }).map(
                          (_, i) => (
                            <Star
                              key={i}
                              className="h-4 w-4 text-amber-400 fill-amber-400"
                            />
                          ),
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex items-start mb-4">
                    <MessageSquare className="h-5 w-5 text-primary mr-2 mt-1 flex-shrink-0" />
                    <p className="text-sm text-foreground italic">
                      &ldquo;{testimonial.review}&rdquo;
                    </p>
                  </div>

                  <div className="flex items-start mt-auto">
                    <Brain className="h-5 w-5 text-primary mr-2 mt-1 flex-shrink-0" />
                    <p className="text-sm text-muted-foreground">
                      <span className="font-medium text-foreground">
                        Improvement:{" "}
                      </span>
                      {testimonial.improvement}
                    </p>
                  </div>
                </Card>
              </CarouselItem>
            ))}
          </CarouselContent>
        </Carousel>

        <div className="mt-6 text-center">
          <div className="flex items-center justify-center gap-2">
            {testimonials.map((_, index) => (
              <button
                key={index}
                className={cn(
                  "h-1.5 w-1.5 rounded-full transition-all",
                  index === current ? "bg-primary w-3" : "bg-primary/35",
                )}
                onClick={() => api?.scrollTo(index)}
                aria-label={`Go to slide ${index + 1}`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
});

TestimonialSection.displayName = "TestimonialSection";

// Testimonial data - commented out as it's not being used
/* 
const testimonials = [
  {
    name: "Robert Johnson",
    avatar: "robert-johnson.jpg",
    role: "Stroke Survivor, 58",
    review: "Aphasia Coach has been a game-changer for me. After my stroke, I struggled to find the right words, but the daily exercises have significantly improved my speech.",
    improvement: "Vocabulary recall improved by 40% in 3 months",
    rating: 5
  },
  {
    name: "Maria Garcia",
    avatar: "maria-garcia.jpg",
    role: "Aphasia Patient, 62",
    review: "The personalized approach makes all the difference. My speech therapist works with me through the app, and I can practice anytime, anywhere.",
    improvement: "Now able to form complete sentences in conversation",
    rating: 5
  },
  {
    name: "David Chen",
    avatar: "david-chen.jpg",
    role: "Brain Injury Survivor, 45",
    review: "I was skeptical at first, but the progress I've made is undeniable. The app's speech recognition gives me immediate feedback that helps me improve.",
    improvement: "Reading comprehension increased from basic to intermediate level",
    rating: 4
  },
  {
    name: "Sarah Williams",
    avatar: "sarah-williams.jpg",
    role: "Primary Progressive Aphasia Patient, 67",
    review: "Even with a degenerative condition, I've been able to maintain my communication skills longer than expected. The exercises keep my mind active.",
    improvement: "Maintained verbal skills despite progressive condition",
    rating: 5
  },
  {
    name: "James Taylor",
    avatar: "james-taylor.jpg",
    role: "Caregiver & Spouse",
    review: "As a caregiver, I've seen firsthand how Aphasia Coach has helped my husband regain confidence in social situations. We're both grateful for this tool.",
    improvement: "Partner now participates in family conversations again",
    rating: 5
  }
];
*/

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
      text: "Download Now",
      url: "#",
    },
    secondary: {
      text: "Learn More",
      url: "#",
    },
  },
}: CtaProps) => {
  return (
    <section className="py-28 flex items-center justify-center bg-muted/10">
      <div className="container">
        <div className="flex w-full flex-col gap-16 overflow-hidden rounded-lg bg-accent p-8 md:rounded-xl lg:flex-row lg:items-center lg:p-16">
          <div className="flex-1">
            <h3 className="mb-3 text-2xl font-semibold md:mb-4 md:text-4xl lg:mb-6">
              {heading}
            </h3>
            <p className="text-muted-foreground lg:text-lg">{description}</p>
          </div>
          <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
            {buttons.secondary && (
              <Button variant="outline" asChild>
                <a href={buttons.secondary.url}>{buttons.secondary.text}</a>
              </Button>
            )}
            {buttons.primary && (
              <Button asChild>
                <a href={buttons.primary.url}>{buttons.primary.text}</a>
              </Button>
            )}
          </div>
        </div>
      </div>
    </section>
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
