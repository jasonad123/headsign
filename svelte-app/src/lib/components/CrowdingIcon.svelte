<script lang="ts">
	import { _ } from 'svelte-i18n';
	import type { OccupancyStatus } from '$lib/services/nearby';

	let { level }: { level?: OccupancyStatus | null } = $props();

	let filledCount = $derived(level ?? 0);

	let ariaLabel = $derived.by(() => {
		if (level === 1) return $_('aria.crowding.notCrowded');
		if (level === 2) return $_('aria.crowding.someCrowding');
		if (level === 3) return $_('aria.crowding.crowded');
		return '';
	});
</script>

{#if level != null && level >= 1 && level <= 3}
	<span class="crowding-badge" aria-label={ariaLabel} title={ariaLabel}>
		{#each [1, 2, 3] as i (i)}
			<iconify-icon
				icon="mdi:account"
				class="crowding-person"
				class:filled={i <= filledCount}
			></iconify-icon>
		{/each}
	</span>
{/if}

<style>
	.crowding-badge {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0;
		background: rgba(255, 255, 255, 0.3);
		border-radius: 40rem;
		padding: 0.15em 0.35em;
		line-height: 1;
		box-shadow: 0px 1px 4px rgba(0, 0, 0, 0.1);
		vertical-align: middle;
	}

	.crowding-person {
		display: inline-block;
		width: 0.85em;
		height: 0.85em;
		color: currentColor;
		opacity: 0.2;
		transition: opacity 0.2s;
	}

	.crowding-person.filled {
		opacity: 1;
	}
</style>
