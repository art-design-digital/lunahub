<!-- src/routes/login/+page.svelte -->
<script lang="ts">
  import type { ActionData } from './$types';
  let { form }: { form: ActionData } = $props();
</script>

<svelte:head><title>Login — Fileorganizer</title></svelte:head>

<div class="login-wrap">
  <div class="login-box">
    <h1>art&amp;design</h1>
    <p class="subtitle">Projekt-Index</p>

    <form method="POST">
      {#if form?.error}
        <div class="error">{form.error}</div>
      {/if}

      <label>
        E-Mail
        <input type="email" name="email" required autofocus
          value={form?.email ?? ''} />
      </label>

      <label>
        Passwort
        <input type="password" name="password" required />
      </label>

      <label class="remember">
        <input type="checkbox" name="remember" />
        30 Tage eingeloggt bleiben
      </label>

      <button type="submit">Anmelden</button>
    </form>
  </div>
</div>

<style>
  .login-wrap {
    min-height: 100vh; display: flex;
    align-items: center; justify-content: center;
    background: #f0f0f0;
  }
  .login-box {
    background: white; padding: 40px;
    border-radius: 12px; width: 340px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.1);
  }
  h1 { font-size: 22px; font-weight: 700; color: #1a1a1a; }
  .subtitle { font-size: 13px; color: #999; margin-bottom: 28px; }
  label { display: flex; flex-direction: column; gap: 5px;
    font-size: 13px; font-weight: 600; color: #555; margin-bottom: 14px; }
  input[type=email], input[type=password] {
    padding: 9px 12px; border: 1px solid #ddd; border-radius: 6px;
    font-size: 14px; outline: none; transition: border-color 0.15s;
  }
  input:focus { border-color: #1a1a1a; }
  .remember { flex-direction: row; align-items: center;
    font-weight: 400; color: #777; gap: 8px; }
  button {
    width: 100%; padding: 11px; background: #1a1a1a; color: white;
    border: none; border-radius: 6px; font-size: 14px;
    font-weight: 600; cursor: pointer; margin-top: 8px;
  }
  button:hover { background: #333; }
  .error {
    background: #fef2f2; color: #c0392b;
    padding: 10px 12px; border-radius: 6px;
    font-size: 13px; margin-bottom: 16px;
  }
</style>
