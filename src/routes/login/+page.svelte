<!-- src/routes/login/+page.svelte -->
<script lang="ts">
  import { page } from '$app/state';
  import { Button } from '$lib/components/ui/button/index.js';
  import logo from '$lib/assets/logo.png';

  const error = $derived(page.url.searchParams.get('error'));
</script>

<svelte:head><title>Login — LunaHub</title></svelte:head>

<div class="min-h-screen flex flex-col items-center justify-center bg-[#F5F5F5]">
  <div class="bg-white rounded-2xl shadow-lg w-[380px] overflow-hidden">
    <!-- Logo-Header -->
    <div class="bg-[#3A3A3A] px-8 py-7 flex items-center justify-center">
      <img src={logo} alt="art&design" class="h-10 brightness-0 invert" />
    </div>

    <!-- Login -->
    <div class="px-8 py-7">
      <p class="text-sm text-muted-foreground mb-6 text-center tracking-wide">LunaHub</p>

      {#if error}
        <div class="bg-red-50 text-[#890813] text-sm rounded-lg px-3 py-2.5 border border-red-100 mb-4">
          {error}
        </div>
      {/if}

      <Button
        href="/auth/login"
        class="w-full h-10 bg-[#890813] hover:bg-[#6d0610] text-white font-medium"
      >
        Mit Microsoft anmelden
      </Button>
    </div>
  </div>

  <p class="mt-6 text-xs text-muted-foreground">art&amp;design werbeagentur GmbH</p>
</div>
