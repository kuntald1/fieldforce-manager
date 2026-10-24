import { useState } from "react";
import styles from "./Login.module.css";
import RouteIllustration from "../components/RouteIllustration";
import { login, getCurrentUser } from "../api/client";

export default function Login({ onSignedIn }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { access_token } = await login(email, password);
      const user = await getCurrentUser(access_token);
      onSignedIn(access_token, user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.brand}>
        <div className={styles.wordmark}>
          <span className={styles.wordmarkDot} />
          FieldForce Manager
        </div>

        <div className={styles.brandMain}>
          <h1 className={styles.headline}>
            Every visit,
            <br />
            <em>accounted for.</em>
          </h1>
          <p className={styles.subcopy}>
            Plan routes, verify check-ins, and see where your team is — all
            in one place.
          </p>
        </div>

        <div className={styles.illustrationWrap}>
          <RouteIllustration />
        </div>

        <div className={styles.brandFooter}>FieldForce Manager — by Vorpet</div>
      </div>

      <div className={styles.formPanel}>
        <form className={styles.formInner} onSubmit={handleSubmit}>
          <h2 className={styles.formHeading}>Sign in</h2>
          <p className={styles.formSub}>Enter your work email and password to continue.</p>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              className={styles.input}
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              autoFocus
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              className={styles.input}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>

          {error && <p className={styles.errorText}>{error}</p>}

          <button type="submit" className={styles.submit} disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
