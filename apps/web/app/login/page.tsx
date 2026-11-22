import { LoginForm } from './login-form';

export default function LoginPage() {
  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <a href="/" className="text-sm text-emerald-300">
        Aide
      </a>
      <h1 className="mt-6 text-3xl font-semibold">Owner sign in</h1>
      <LoginForm />
    </main>
  );
}
