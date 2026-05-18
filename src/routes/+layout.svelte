<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { LayoutData } from './$types';
	import favicon from '$lib/assets/favicon.svg';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<style>
		*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
		body {
			font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
			background: #f0f0f0; color: #333;
		}
		a { color: inherit; text-decoration: none; }
	</style>
</svelte:head>

{@render children()}
