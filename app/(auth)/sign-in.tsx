import React, { useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as Linking from "expo-linking";
import * as Haptics from "expo-haptics";
import Animated, { FadeInDown, FadeInUp } from "react-native-reanimated";
import { ArrowLeft, Check, Mail } from "lucide-react-native";
import colors from "@/constants/colors";
import { getSupabase } from "@/lib/supabase";
import { useAuth } from "@/lib/useAuth";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SignInScreen() {
  const insets = useSafeAreaInsets();
  const { configured, loading } = useAuth();

  const [email, setEmail] = useState("");
  const [focused, setFocused] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const webBottomInset = Platform.OS === "web" ? 34 : 0;

  const canSubmit = EMAIL_PATTERN.test(email.trim()) && !sending;

  const goBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/");
    }
  };

  const handleSignIn = async () => {
    if (!canSubmit) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSending(true);
    setError(null);

    try {
      const { error: otpError } = await getSupabase().auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: Linking.createURL("/") },
      });

      if (otpError) throw otpError;
      setSent(true);
    } catch (otpError) {
      setError(
        otpError instanceof Error
          ? otpError.message
          : "Could not send the sign-in link. Please try again."
      );
    }

    setSending(false);
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <LinearGradient
        colors={["#054A14", "#0B6623", "#0D7A2B"]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />

      <View style={styles.patternOverlay} pointerEvents="none">
        <View style={styles.circle1} />
        <View style={styles.circle2} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + webTopInset + 24,
            paddingBottom: insets.bottom + webBottomInset + 24,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Pressable
          onPress={goBack}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
          hitSlop={8}
        >
          <ArrowLeft size={22} color="#FFFFFF" strokeWidth={2.5} />
        </Pressable>

        <Animated.View
          entering={FadeInDown.delay(200).duration(600)}
          style={styles.header}
        >
          <View style={styles.iconContainer}>
            {sent ? (
              <Check size={32} color="#FFFFFF" strokeWidth={2.5} />
            ) : (
              <Mail size={32} color="#FFFFFF" strokeWidth={2.5} />
            )}
          </View>
          <Text style={styles.title}>
            {sent ? "Check your inbox" : "Welcome back"}
          </Text>
          <Text style={styles.subtitle}>
            {sent
              ? "We sent you a secure sign-in link"
              : "Sign in to save places and sync across devices"}
          </Text>
        </Animated.View>

        <Animated.View
          entering={FadeInDown.delay(400).duration(600)}
          style={styles.card}
        >
          {sent ? (
            <View style={styles.sentBlock}>
              <Text style={styles.cardTitle}>Almost there</Text>
              <Text style={styles.cardDescription}>
                Tap the link in the email sent to {email.trim()} to finish
                signing in. You can close this screen.
              </Text>

              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setSent(false);
                }}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.secondaryText}>Use a different email</Text>
              </Pressable>

              <Pressable
                onPress={goBack}
                style={({ pressed }) => [
                  styles.exploreButton,
                  pressed && styles.exploreButtonPressed,
                ]}
              >
                <LinearGradient
                  colors={["#0B6623", "#0D7A2B"]}
                  style={styles.exploreGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  <Check size={20} color="#FFFFFF" strokeWidth={2.5} />
                  <Text style={styles.exploreText}>Done</Text>
                </LinearGradient>
              </Pressable>
            </View>
          ) : (
            <View style={styles.formBlock}>
              <Text style={styles.cardTitle}>Sign In</Text>
              <Text style={styles.cardDescription}>
                Enter your email and we&apos;ll send a secure link — no password
                needed
              </Text>

              {configured ? (
                <>
                  <View
                    style={[
                      styles.inputWrapper,
                      focused && styles.inputWrapperFocused,
                    ]}
                  >
                    <Mail size={18} color={colors.light.gray} strokeWidth={2} />
                    <TextInput
                      style={styles.input}
                      placeholder="you@university.edu.ng"
                      placeholderTextColor={colors.light.gray}
                      value={email}
                      onChangeText={(text) => {
                        setEmail(text);
                        setError(null);
                      }}
                      onFocus={() => setFocused(true)}
                      onBlur={() => setFocused(false)}
                      autoCapitalize="none"
                      autoComplete="email"
                      keyboardType="email-address"
                      returnKeyType="go"
                      editable={!sending}
                      onSubmitEditing={handleSignIn}
                    />
                  </View>

                  {error && <Text style={styles.errorText}>{error}</Text>}

                  <Pressable
                    onPress={handleSignIn}
                    disabled={!canSubmit}
                    style={({ pressed }) => [
                      styles.exploreButton,
                      !canSubmit && styles.exploreButtonDisabled,
                      pressed && canSubmit && styles.exploreButtonPressed,
                    ]}
                  >
                    <LinearGradient
                      colors={
                        canSubmit ? ["#0B6623", "#0D7A2B"] : ["#C8D6C8", "#C8D6C8"]
                      }
                      style={styles.exploreGradient}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                    >
                      {sending ? (
                        <ActivityIndicator size="small" color={colors.light.white} />
                      ) : (
                        <Mail size={20} color={canSubmit ? colors.light.white : colors.light.gray} />
                      )}
                      <Text
                        style={[
                          styles.exploreText,
                          !canSubmit && styles.exploreTextDisabled,
                        ]}
                      >
                        {sending ? "Sending link..." : "Send Sign-In Link"}
                      </Text>
                    </LinearGradient>
                  </Pressable>

                  <Text style={styles.helperText}>
                    We&apos;ll email you a one-time link. No password to remember.
                  </Text>
                </>
              ) : (
                <View style={styles.sentBlock}>
                  <Text style={styles.cardTitle}>Sign-in unavailable</Text>
                  <Text style={styles.cardDescription}>
                    Campus Navigator hasn&apos;t connected to its backend yet.
                    You can keep exploring the campus as a guest.
                  </Text>
                </View>
              )}
            </View>
          )}
        </Animated.View>

        {!loading && (
          <Animated.View
            entering={FadeInUp.delay(600).duration(600)}
            style={styles.footer}
          >
            <Pressable
              onPress={goBack}
              style={({ pressed }) => [styles.guestButton, pressed && styles.pressed]}
            >
              <Text style={styles.guestText}>Continue as guest</Text>
            </Pressable>
            <Text style={styles.footerText}>
              Guest access lets you browse the map and get directions.
            </Text>
          </Animated.View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.light.tintDark,
  },
  patternOverlay: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
  },
  circle1: {
    position: "absolute",
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: "rgba(255,255,255,0.03)",
    top: -60,
    right: -80,
  },
  circle2: {
    position: "absolute",
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: "rgba(255,255,255,0.02)",
    bottom: 120,
    left: -60,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 24,
    justifyContent: "center",
  },
  backButton: {
    position: "absolute",
    top: 0,
    left: 0,
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: {
    opacity: 0.7,
  },
  header: {
    alignItems: "center",
    gap: 12,
    marginBottom: 32,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  title: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    color: colors.light.white,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.7)",
    textAlign: "center",
    lineHeight: 22,
  },
  card: {
    backgroundColor: colors.light.card,
    borderRadius: 20,
    padding: 24,
    gap: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 8,
  },
  formBlock: {
    gap: 16,
  },
  sentBlock: {
    gap: 16,
  },
  cardTitle: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: colors.light.text,
  },
  cardDescription: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: colors.light.textSecondary,
    lineHeight: 20,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1.5,
    borderColor: colors.light.border,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: colors.light.backgroundSecondary,
  },
  inputWrapperFocused: {
    borderColor: colors.light.tint,
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: colors.light.text,
    paddingVertical: 0,
  },
  errorText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: colors.light.danger,
    lineHeight: 18,
  },
  exploreButton: {
    borderRadius: 14,
    overflow: "hidden",
  },
  exploreButtonDisabled: {
    opacity: 0.7,
  },
  exploreButtonPressed: {
    transform: [{ scale: 0.98 }],
  },
  exploreGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 16,
    paddingHorizontal: 24,
  },
  exploreText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: colors.light.white,
  },
  exploreTextDisabled: {
    color: colors.light.gray,
  },
  secondaryButton: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.light.tint,
    backgroundColor: colors.light.tintLight,
  },
  secondaryText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: colors.light.tint,
  },
  helperText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: colors.light.textSecondary,
    textAlign: "center",
    lineHeight: 18,
  },
  footer: {
    alignItems: "center",
    gap: 8,
    marginTop: 24,
  },
  guestButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  guestText: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    color: colors.light.white,
  },
  footerText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.6)",
    textAlign: "center",
    lineHeight: 18,
  },
});
