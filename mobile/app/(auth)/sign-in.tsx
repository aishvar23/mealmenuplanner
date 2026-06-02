import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  sendMagicLink,
  signInWithEmail,
  signUpWithEmail,
} from "@/auth/actions";
import { signInWithGoogle } from "@/auth/oauth";
import { Button } from "@/components/Button";
import { ErrorBanner } from "@/components/Feedback";
import { TextField } from "@/components/TextField";

/**
 * Sign in / sign up / magic-link (M1-1, design/10 § 3). On success the Supabase
 * session lands in secure storage and `AuthProvider`'s `onAuthStateChange` fires,
 * so the `(auth)` layout redirects to the tabs — this screen just collects input
 * and surfaces typed errors. Google OAuth (M1-2) mounts below the divider.
 */

type Mode = "sign-in" | "sign-up" | "magic-link";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;

const COPY: Record<Mode, { cta: string; switchTo: Mode; switchLabel: string }> =
  {
    "sign-in": {
      cta: "Sign in",
      switchTo: "sign-up",
      switchLabel: "New here? Create an account",
    },
    "sign-up": {
      cta: "Create account",
      switchTo: "sign-in",
      switchLabel: "Already have an account? Sign in",
    },
    "magic-link": {
      cta: "Email me a sign-in link",
      switchTo: "sign-in",
      switchLabel: "Use a password instead",
    },
  };

export default function SignInScreen() {
  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{
    email?: string;
    password?: string;
  }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const usesPassword = mode !== "magic-link";
  const busy = submitting || googleLoading;

  function validate(): boolean {
    const errors: { email?: string; password?: string } = {};
    if (!EMAIL_RE.test(email.trim())) {
      errors.email = "Enter a valid email address.";
    }
    if (usesPassword && password.length < MIN_PASSWORD) {
      errors.password = `Use at least ${MIN_PASSWORD} characters.`;
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function onSubmit() {
    setFormError(null);
    if (!validate()) return;
    setSubmitting(true);
    try {
      const result =
        mode === "sign-in"
          ? await signInWithEmail(email, password)
          : mode === "sign-up"
            ? await signUpWithEmail(email, password)
            : await sendMagicLink(email);

      if (!result.ok) {
        setFormError(result.message);
      } else if (result.needsEmailConfirmation) {
        // No session yet (magic link, or sign-up with confirmation on).
        setSentTo(email.trim());
      }
      // On a real session the auth listener redirects us; nothing to do here.
    } finally {
      setSubmitting(false);
    }
  }

  async function onGoogle() {
    setFormError(null);
    setGoogleLoading(true);
    try {
      const result = await signInWithGoogle();
      if (!result.ok) setFormError(result.message);
      // A success sets the session; the auth listener redirects.
    } finally {
      setGoogleLoading(false);
    }
  }

  function switchMode(next: Mode) {
    setMode(next);
    setFieldErrors({});
    setFormError(null);
  }

  if (sentTo) {
    return (
      <SafeAreaView className="flex-1 bg-white">
        <View className="flex-1 items-center justify-center gap-3 px-8">
          <Text className="text-2xl font-bold text-gray-900">
            Check your email
          </Text>
          <Text className="text-center text-base text-gray-500">
            We sent a sign-in link to {sentTo}. Open it on this device to
            continue.
          </Text>
          <View className="mt-4 w-full">
            <Button
              label="Back to sign in"
              variant="secondary"
              onPress={() => {
                setSentTo(null);
                switchMode("sign-in");
              }}
            />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const copy = COPY[mode];

  return (
    <SafeAreaView className="flex-1 bg-white">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerClassName="flex-grow justify-center px-8 py-12"
          keyboardShouldPersistTaps="handled"
        >
          <View className="mb-8">
            <Text className="text-3xl font-bold text-gray-900">
              Home Meal Planner
            </Text>
            <Text className="mt-2 text-base text-gray-500">
              What should we eat today?
            </Text>
          </View>

          <View className="gap-4">
            {formError ? <ErrorBanner message={formError} /> : null}

            <TextField
              label="Email"
              value={email}
              onChangeText={setEmail}
              error={fieldErrors.email}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
              placeholder="you@example.com"
              editable={!busy}
            />

            {usesPassword ? (
              <TextField
                label="Password"
                value={password}
                onChangeText={setPassword}
                error={fieldErrors.password}
                secureTextEntry
                autoCapitalize="none"
                autoComplete={mode === "sign-up" ? "new-password" : "password"}
                textContentType={
                  mode === "sign-up" ? "newPassword" : "password"
                }
                placeholder="••••••••"
                editable={!busy}
              />
            ) : null}

            <Button
              label={copy.cta}
              loading={submitting}
              disabled={busy}
              onPress={onSubmit}
            />

            {mode === "sign-in" ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => switchMode("magic-link")}
                disabled={busy}
              >
                <Text className="text-center text-sm font-medium text-green-700">
                  Email me a sign-in link instead
                </Text>
              </Pressable>
            ) : null}

            <View className="my-2 flex-row items-center gap-3">
              <View className="h-px flex-1 bg-gray-200" />
              <Text className="text-xs font-medium text-gray-400 uppercase">
                or
              </Text>
              <View className="h-px flex-1 bg-gray-200" />
            </View>

            <Button
              label="Continue with Google"
              variant="secondary"
              loading={googleLoading}
              disabled={busy}
              onPress={onGoogle}
            />
          </View>

          <Pressable
            accessibilityRole="button"
            className="mt-8"
            onPress={() => switchMode(copy.switchTo)}
            disabled={busy}
          >
            <Text className="text-center text-sm text-gray-600">
              {copy.switchLabel}
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
