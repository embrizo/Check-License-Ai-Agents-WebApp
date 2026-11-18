"use client";

import { useActionState } from "react";
import { login, type LoginState } from "../actions";
import type { Dict } from "@/i18n/dictionaries";
import {
  Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export function LoginForm({ callbackUrl, notice, t }: { callbackUrl: string; notice?: string | null; t: Dict["login"] }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, undefined);

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>{t.title}</CardTitle>
        <CardDescription>{t.description}</CardDescription>
      </CardHeader>
      <form action={action}>
        <CardContent className="flex flex-col gap-4">
          <input type="hidden" name="callbackUrl" value={callbackUrl} />
          {notice && (
            <p className="rounded-md border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
              {notice}
            </p>
          )}
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">{t.email}</Label>
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">{t.password}</Label>
            <Input id="password" name="password" type="password" autoComplete="current-password" required />
          </div>
          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? t.signingIn : t.signIn}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
