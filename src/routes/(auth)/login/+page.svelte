<script lang="ts">
  import { enhance } from "$app/forms";
  let { form } = $props();
  let loading = $state(false);
</script>

<svelte:head><title>Log in · Print Farm Companion</title></svelte:head>

<div class="auth-wrap">
  <form
    method="POST"
    class="auth-card"
    use:enhance={() => {
      loading = true;
      return async ({ update }) => {
        await update();
        loading = false;
      };
    }}
  >
    <h1>Welcome back</h1>
    <p class="sub">Log in to your print farm.</p>

    {#if form?.error}
      <div class="err">{form.error}</div>
    {/if}

    <label>
      Email
      <input name="email" type="email" autocomplete="email" required value={form?.email ?? ""} placeholder="you@example.com" />
    </label>

    <label>
      Password
      <input name="password" type="password" autocomplete="current-password" required placeholder="Your password" />
    </label>

    <button type="submit" disabled={loading}>
      {loading ? "Logging in…" : "Log in"}
    </button>

    <p class="alt">No account yet? <a href="/signup">Sign up</a></p>
  </form>
</div>

<style>
  .auth-wrap {
    min-height: 100vh;
    display: grid;
    place-items: center;
    padding: 2rem;
    background: #0b0f17;
  }
  .auth-card {
    width: 100%;
    max-width: 26rem;
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
    background: #131a26;
    border: 1px solid #243044;
    border-radius: 14px;
    padding: 2rem;
    color: #e6edf6;
  }
  h1 { margin: 0; font-size: 1.4rem; }
  .sub { margin: 0 0 0.5rem; color: #8a98ad; font-size: 0.9rem; }
  label { display: flex; flex-direction: column; gap: 0.3rem; font-size: 0.85rem; color: #aab6c8; }
  input {
    background: #0d131d;
    border: 1px solid #2a3a52;
    border-radius: 8px;
    padding: 0.6rem 0.7rem;
    color: #e6edf6;
    font-size: 0.95rem;
  }
  input:focus { outline: none; border-color: #4c8dff; }
  button {
    margin-top: 0.4rem;
    background: #3b82f6;
    color: white;
    border: none;
    border-radius: 8px;
    padding: 0.7rem;
    font-size: 0.95rem;
    font-weight: 600;
    cursor: pointer;
  }
  button:disabled { opacity: 0.6; cursor: default; }
  .err {
    background: #3a1620;
    border: 1px solid #6b2435;
    color: #ffb3c0;
    border-radius: 8px;
    padding: 0.6rem 0.7rem;
    font-size: 0.85rem;
  }
  .alt { margin: 0.4rem 0 0; font-size: 0.85rem; color: #8a98ad; text-align: center; }
  .alt a { color: #6aa3ff; }
</style>
