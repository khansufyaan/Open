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
  const [subOrgId, setSubOrgId] = useState<string | null>(null);
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

        const errorMessage = data?.message ?? data?.error ?? "Unable to prepare user account.";
        throw new Error(errorMessage);
      }

      const userData = await ensureUserResponse.json() as {
        created: boolean;
        subOrganizationId?: string;
        subOrgExists?: boolean;
      };
      console.log(`[Auth] User registration result:`, userData);

      const userSubOrgId = userData.subOrganizationId;
      console.log(`[Auth] Sub-organization ID: ${userSubOrgId ?? 'not returned'}`);

      if (!userSubOrgId) {
        throw new Error("Sub-organization ID not returned - cannot proceed with OTP login");
      }

      // Store sub-org ID for later use in otpLogin
      setSubOrgId(userSubOrgId);

      if (!turnkey) {
        throw new Error("Authentication client not available");
      }

      console.log(`[Auth] Initiating email OTP for: ${trimmedEmail}`);
      console.log(`[Auth] Using PARENT org ID for initOtp: ${process.env.NEXT_PUBLIC_TURNKEY_ORGANIZATION_ID}`);

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
        throw new Error("Authentication clients not available");
      }

      console.log(`[Auth] Verifying OTP code with parent org ID`);
      const verifyResponse = await turnkey.serverSign("verifyOtp", [{
        otpId: otpId,
        otpCode: otpCode.trim(),
        organizationId: process.env.NEXT_PUBLIC_TURNKEY_ORGANIZATION_ID!
      }]) as { verificationToken: string };

      console.log(`[Auth] OTP verified successfully`);

      // Clear IndexedDB to get a fresh credential for each login
      // This prevents the "credential already exists" error
      console.log(`[Auth] Clearing IndexedDB to generate fresh credential`);
      await indexedDbClient.clear();

      await indexedDbClient.init();
      const publicKey = await indexedDbClient.getPublicKey();

      if (!subOrgId) {
        throw new Error("Sub-organization ID not available - cannot complete login");
      }

      console.log(`[Auth] Logging in with SUB-ORG ID: ${subOrgId}`);
      const loginResponse = await turnkey.serverSign("otpLogin", [{
        publicKey: publicKey,
        verificationToken: verifyResponse.verificationToken,
        organizationId: subOrgId,
        expirationSeconds: "900"
      }]) as { session?: string };

      const sessionToken = loginResponse?.session;

      if (!sessionToken) {
        throw new Error("Authentication service did not return a session token.");
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
      <CardHeader className="space-y-6 text-center pb-8">
        <div className="flex justify-center">
          <div className="h-20 w-20 rounded-2xl bg-blue-600 flex items-center justify-center">
            <span className="text-4xl font-bold text-white">B</span>
          </div>
        </div>
        <div className="space-y-2">
          <CardTitle className="text-3xl font-bold">Blue Wallets</CardTitle>
          <CardDescription className="text-base text-slate-500">
            Receive USDC Instantly
          </CardDescription>
        </div>
        <div className="space-y-2 pt-4">
          <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">
            Sign in with your email
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            We&apos;ll send you a code to verify your identity
          </p>
        </div>
      </CardHeader>
      <CardContent className="px-8 pb-8">
        <form onSubmit={handleEmailAuth} className="space-y-6">
          <div className="space-y-3">
            <Label htmlFor="email" className="text-base font-medium text-slate-700 dark:text-slate-300">
              Email Address
            </Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="h-12 text-base"
            />
          </div>
          <Button
            type="submit"
            disabled={isRequesting || !email.trim()}
            className="w-full h-12 text-base font-semibold bg-blue-600 hover:bg-blue-700"
            size="lg"
          >
            {isRequesting ? "Sending code..." : "Send Verification Code"}
          </Button>
        </form>
      </CardContent>
    </>
  );

  const renderVerifyStep = () => (
    <>
      <CardHeader className="space-y-6 text-center pb-8">
        <div className="flex justify-center">
          <div className="h-20 w-20 rounded-2xl bg-blue-600 flex items-center justify-center">
            <span className="text-4xl font-bold text-white">B</span>
          </div>
        </div>
        <div className="space-y-2">
          <CardTitle className="text-3xl font-bold">Blue Wallets</CardTitle>
          <CardDescription className="text-base text-slate-500">
            Receive USDC Instantly
          </CardDescription>
        </div>
        <div className="space-y-2 pt-4">
          <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">
            Enter verification code
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Enter the 6-digit code sent to {email}
          </p>
        </div>
      </CardHeader>
      <CardContent className="px-8 pb-8">
        <form onSubmit={handleVerifyOtp} className="space-y-6">
          <div className="space-y-3">
            <Label htmlFor="otp" className="text-base font-medium text-slate-700 dark:text-slate-300">
              Verification Code
            </Label>
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
              className="h-12 text-base text-center text-2xl tracking-widest"
            />
          </div>
          <div className="flex flex-col gap-3">
            <Button
              type="submit"
              disabled={isVerifying || otpCode.length !== 6}
              className="w-full h-12 text-base font-semibold bg-blue-600 hover:bg-blue-700"
              size="lg"
            >
              {isVerifying ? "Verifying..." : "Verify and Sign In"}
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
              className="h-10 text-sm"
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
      <DialogContent className="sm:max-w-lg p-0">
        <DialogTitle className="sr-only">Sign in to Blue Wallet</DialogTitle>
        <Card className="border-0 shadow-none">
          {step === "request" ? renderRequestStep() : renderVerifyStep()}
        </Card>
      </DialogContent>
    </Dialog>
  );
}
