"use client";

import { useState } from "react";
import { useTurnkey } from "@turnkey/sdk-react";
import { Mail, KeyRound, Chrome, Phone } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";

interface TurnkeyLoginFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAuthSuccess: () => void;
  onAuthError: (error: string) => void;
}

export function TurnkeyLoginForm({
  open,
  onOpenChange,
  onAuthSuccess,
  onAuthError,
}: TurnkeyLoginFormProps) {
  const { turnkey, passkeyClient, indexedDbClient } = useTurnkey();
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [isLoading, setIsLoading] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<"main" | "email" | "phone" | "verify-email" | "verify-phone">("main");
  const [otpId, setOtpId] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState("");

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      onAuthError("Please enter a valid email address");
      return;
    }

    setIsLoading("email");
    try {
      if (!turnkey) {
        throw new Error("Turnkey client not available");
      }

      // Initialize OTP for email
      const response = await turnkey.serverSign("initOtp", [{
        otpType: "OTP_TYPE_EMAIL",
        contact: email.trim(),
        organizationId: process.env.NEXT_PUBLIC_TURNKEY_ORGANIZATION_ID!,
        otpLength: 6,
        expirationSeconds: 300
      }]) as { otpId: string };

      setOtpId(response.otpId);
      setAuthMode("verify-email");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to send email OTP";
      onAuthError(message);
    } finally {
      setIsLoading(null);
    }
  };

  const handlePhoneAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim()) {
      onAuthError("Please enter a valid phone number");
      return;
    }

    setIsLoading("phone");
    try {
      if (!turnkey) {
        throw new Error("Turnkey client not available");
      }

      // Initialize OTP for SMS
      const response = await turnkey.serverSign("initOtp", [{
        otpType: "OTP_TYPE_SMS",
        contact: phone.trim(),
        organizationId: process.env.NEXT_PUBLIC_TURNKEY_ORGANIZATION_ID!,
        otpLength: 6,
        expirationSeconds: 300
      }]) as { otpId: string };

      setOtpId(response.otpId);
      setAuthMode("verify-phone");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to send SMS OTP";
      onAuthError(message);
    } finally {
      setIsLoading(null);
    }
  };

  const handlePasskeyAuth = async () => {
    setIsLoading("passkey");
    try {
      if (!passkeyClient || !indexedDbClient) {
        throw new Error("Passkey or IndexedDB client not available");
      }

      // Initialize IndexedDB client and get public key
      await indexedDbClient.init();
      const publicKey = await indexedDbClient.getPublicKey();

      // Use the proper Turnkey SDK method for passkey login
      await passkeyClient.loginWithPasskey({
        publicKey: publicKey,
        organizationId: process.env.NEXT_PUBLIC_TURNKEY_ORGANIZATION_ID!,
        sessionType: "SESSION_TYPE_READ_WRITE",
        expirationSeconds: 900
      });

      onAuthSuccess();
      onOpenChange(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Passkey authentication failed";
      onAuthError(message);
    } finally {
      setIsLoading(null);
    }
  };

  const handleGoogleAuth = async () => {
    setIsLoading("google");
    try {
      onAuthError("Google authentication requires OAuth setup in Turnkey dashboard");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Google authentication failed";
      onAuthError(message);
    } finally {
      setIsLoading(null);
    }
  };

  const renderMainView = () => (
    <>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">Welcome back</CardTitle>
        <CardDescription>
          Choose your preferred way to sign in to your account
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Passkey - Primary option */}
        <Button
          onClick={handlePasskeyAuth}
          disabled={isLoading !== null}
          className="w-full h-12"
        >
          <KeyRound className="mr-2 h-4 w-4" />
          {isLoading === "passkey" ? "Authenticating..." : "Sign in with Passkey"}
        </Button>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">Or</span>
          </div>
        </div>

        {/* Email/Phone Options */}
        <div className="grid grid-cols-1 gap-3">
          <Button
            variant="outline"
            onClick={() => setAuthMode("email")}
            disabled={isLoading !== null}
            className="w-full"
          >
            <Mail className="mr-2 h-4 w-4" />
            Continue with Email
          </Button>

          <Button
            variant="outline"
            onClick={() => setAuthMode("phone")}
            disabled={isLoading !== null}
            className="w-full"
          >
            <Phone className="mr-2 h-4 w-4" />
            Continue with Phone
          </Button>
        </div>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">Social Login (Setup Required)</span>
          </div>
        </div>

        {/* Social Login - Disabled until configured */}
        <div className="grid grid-cols-1 gap-3">
          <Button
            variant="outline"
            onClick={handleGoogleAuth}
            disabled={true}
            className="w-full opacity-50"
          >
            <Chrome className="mr-2 h-4 w-4" />
            Google (Requires Setup)
          </Button>
        </div>

        <div className="text-center text-sm text-muted-foreground">
          By continuing, you agree to our{" "}
          <a href="#" className="underline hover:text-primary">
            Terms of Service
          </a>{" "}
          and{" "}
          <a href="#" className="underline hover:text-primary">
            Privacy Policy
          </a>
        </div>
      </CardContent>
    </>
  );

  const renderEmailView = () => (
    <>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">Sign in with Email</CardTitle>
        <CardDescription>
          Enter your email address to receive a secure login code
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleEmailAuth} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="m@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-3">
            <Button type="submit" disabled={isLoading === "email" || !email.trim()}>
              {isLoading === "email" ? "Sending..." : "Send Login Code"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setAuthMode("main")}
              disabled={isLoading !== null}
            >
              Back to options
            </Button>
          </div>
        </form>
      </CardContent>
    </>
  );

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpCode.trim() || !otpId) {
      onAuthError("Please enter the verification code");
      return;
    }

    const isEmail = authMode === "verify-email";
    setIsLoading(isEmail ? "verify-email" : "verify-phone");

    try {
      if (!turnkey || !indexedDbClient) {
        throw new Error("Turnkey clients not available");
      }

      // Verify the OTP code
      const verifyResponse = await turnkey.serverSign("verifyOtp", [{
        otpId: otpId,
        otpCode: otpCode.trim(),
        organizationId: process.env.NEXT_PUBLIC_TURNKEY_ORGANIZATION_ID!
      }]) as { verificationToken: string };

      // Initialize IndexedDB and get public key
      await indexedDbClient.init();
      const publicKey = await indexedDbClient.getPublicKey();

      // Complete OTP login
      await turnkey.serverSign("otpLogin", [{
        publicKey: publicKey,
        verificationToken: verifyResponse.verificationToken,
        organizationId: process.env.NEXT_PUBLIC_TURNKEY_ORGANIZATION_ID!,
        expirationSeconds: 900
      }]);

      onAuthSuccess();
      onOpenChange(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Verification failed";
      onAuthError(message);
    } finally {
      setIsLoading(null);
    }
  };

  const renderPhoneView = () => (
    <>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">Sign in with Phone</CardTitle>
        <CardDescription>
          Enter your phone number to receive a verification code
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handlePhoneAuth} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="phone">Phone Number</Label>
            <PhoneInput
              id="phone"
              value={phone}
              onChange={(value) => setPhone(value)}
              required
            />
          </div>
          <div className="flex flex-col gap-3">
            <Button type="submit" disabled={isLoading === "phone" || !phone.trim()}>
              {isLoading === "phone" ? "Sending..." : "Send Verification Code"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setAuthMode("main")}
              disabled={isLoading !== null}
            >
              Back to options
            </Button>
          </div>
        </form>
      </CardContent>
    </>
  );

  const renderVerifyEmailView = () => (
    <>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">Verify Email</CardTitle>
        <CardDescription>
          Enter the 6-digit code sent to {email}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleVerifyOtp} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="otp">Verification Code</Label>
            <Input
              id="otp"
              type="text"
              placeholder="123456"
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              maxLength={6}
              required
            />
          </div>
          <div className="flex flex-col gap-3">
            <Button type="submit" disabled={isLoading === "verify-email" || otpCode.length !== 6}>
              {isLoading === "verify-email" ? "Verifying..." : "Verify Code"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => { setAuthMode("email"); setOtpCode(""); setOtpId(null); }}
              disabled={isLoading !== null}
            >
              Back to email
            </Button>
          </div>
        </form>
      </CardContent>
    </>
  );

  const renderVerifyPhoneView = () => (
    <>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">Verify Phone</CardTitle>
        <CardDescription>
          Enter the 6-digit code sent to {phone}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleVerifyOtp} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="otp">Verification Code</Label>
            <Input
              id="otp"
              type="text"
              placeholder="123456"
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              maxLength={6}
              required
            />
          </div>
          <div className="flex flex-col gap-3">
            <Button type="submit" disabled={isLoading === "verify-phone" || otpCode.length !== 6}>
              {isLoading === "verify-phone" ? "Verifying..." : "Verify Code"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => { setAuthMode("phone"); setOtpCode(""); setOtpId(null); }}
              disabled={isLoading !== null}
            >
              Back to phone
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
          {authMode === "main" && renderMainView()}
          {authMode === "email" && renderEmailView()}
          {authMode === "phone" && renderPhoneView()}
          {authMode === "verify-email" && renderVerifyEmailView()}
          {authMode === "verify-phone" && renderVerifyPhoneView()}
        </Card>
      </DialogContent>
    </Dialog>
  );
}