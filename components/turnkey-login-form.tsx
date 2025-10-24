"use client";

import { useState } from "react";
import { useTurnkey } from "@turnkey/sdk-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

interface TurnkeyLoginFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAuthSuccess: (email: string) => void;
  onAuthError: (error: string) => void;
}

export function TurnkeyLoginForm({
  open,
  onOpenChange,
  onAuthSuccess,
  onAuthError,
}: TurnkeyLoginFormProps) {
  const { turnkey, indexedDbClient } = useTurnkey();
  const [email, setEmail] = useState("");
  const [otpId, setOtpId] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState("");
  const [step, setStep] = useState<"request" | "verify">("request");
  const [isRequesting, setIsRequesting] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      onAuthError("Please enter a valid email address.");
      return;
    }

    setIsRequesting(true);
    try {
      console.log(`[Auth] Creating/verifying Turnkey user for: ${trimmedEmail}`);

      const ensureUserResponse = await fetch("/api/turnkey/create-user", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: trimmedEmail }),
      });

      if (!ensureUserResponse.ok) {
        const data = (await ensureUserResponse.json().catch(() => null)) as
          | { message?: string; error?: string; details?: unknown }
          | null;

        console.error("[Auth] Failed to create/verify user:", data);

        const errorMessage = data?.message ?? data?.error ?? "Unable to prepare Turnkey user.";
        throw new Error(errorMessage);
      }

      const userData = await ensureUserResponse.json();
      console.log(`[Auth] User registration result:`, userData);

      if (!turnkey) {
        throw new Error("Turnkey client not available");
      }

      console.log(`[Auth] Initiating email OTP for: ${trimmedEmail}`);

      const response = await turnkey.serverSign("initOtp", [{
        otpType: "OTP_TYPE_EMAIL",
        contact: trimmedEmail,
        organizationId: process.env.NEXT_PUBLIC_TURNKEY_ORGANIZATION_ID!,
        otpLength: 6,
        alphanumeric: false,
        expirationSeconds: "300",
      }]) as { otpId: string };

      console.log(`[Auth] OTP initiated successfully with ID: ${response.otpId}`);

      setOtpId(response.otpId);
      setStep("verify");
    } catch (error) {
      console.error("[Auth] Email auth flow failed:", error);
      const message = error instanceof Error ? error.message : "Failed to send email OTP";
      onAuthError(message);
    } finally {
      setIsRequesting(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpCode.trim() || !otpId) {
      onAuthError("Please enter the verification code");
      return;
    }

    setIsVerifying(true);

    try {
      if (!turnkey || !indexedDbClient) {
        throw new Error("Turnkey clients not available");
      }

      const verifyResponse = await turnkey.serverSign("verifyOtp", [{
        otpId: otpId,
        otpCode: otpCode.trim(),
        organizationId: process.env.NEXT_PUBLIC_TURNKEY_ORGANIZATION_ID!
      }]) as { verificationToken: string };

      await indexedDbClient.init();
      const publicKey = await indexedDbClient.getPublicKey();

      const loginResponse = await turnkey.serverSign("otpLogin", [{
        publicKey: publicKey,
        verificationToken: verifyResponse.verificationToken,
        organizationId: process.env.NEXT_PUBLIC_TURNKEY_ORGANIZATION_ID!,
        expirationSeconds: "900"
      }]) as { session?: string };

      const sessionToken = loginResponse?.session;

      if (!sessionToken) {
        throw new Error("Turnkey did not return a session token.");
      }

      await indexedDbClient.loginWithSession(sessionToken);

      onAuthSuccess(email.trim());
      onOpenChange(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Verification failed";
      onAuthError(message);
    } finally {
      setIsVerifying(false);
    }
  };
  const renderRequestStep = () => (
    <>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">Sign in with Email</CardTitle>
        <CardDescription>
          We&apos;ll send a one-time code to confirm it&apos;s you.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleEmailAuth} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <Button type="submit" disabled={isRequesting || !email.trim()} className="w-full">
            {isRequesting ? "Sending code..." : "Send login code"}
          </Button>
        </form>
      </CardContent>
    </>
  );

  const renderVerifyStep = () => (
    <>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">Enter verification code</CardTitle>
        <CardDescription>
          Enter the 6-digit code sent to {email}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleVerifyOtp} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="otp">Verification code</Label>
            <Input
              id="otp"
              inputMode="text"
              autoComplete="one-time-code"
              placeholder="123456"
              value={otpCode}
              onChange={(e) => {
                const cleaned = e.target.value
                  .toUpperCase()
                  .replace(/[^A-Z0-9]/g, "")
                  .slice(0, 6);
                setOtpCode(cleaned);
              }}
              maxLength={6}
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Button
              type="submit"
              disabled={isVerifying || otpCode.length !== 6}
              className="w-full"
            >
              {isVerifying ? "Verifying..." : "Verify and sign in"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setStep("request");
                setOtpCode("");
                setOtpId(null);
              }}
              disabled={isVerifying}
            >
              Resend code
            </Button>
          </div>
        </form>
      </CardContent>
    </>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-0">
        <DialogTitle className="sr-only">Sign in to Blue Wallet</DialogTitle>
        <Card className="border-0 shadow-none">
          {step === "request" ? renderRequestStep() : renderVerifyStep()}
        </Card>
      </DialogContent>
    </Dialog>
  );
}
