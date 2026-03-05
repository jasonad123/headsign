<script lang="ts">
	import { _ } from 'svelte-i18n';
	import type { NetworkStationGroup, NetworkFloatingGroup } from '$lib/services/placemarks';

	let { item }: { item: NetworkStationGroup | NetworkFloatingGroup } = $props();

	let headerStyle = $derived(
		`background: #${item.color}; color: #${item.textColor}`
	);

	function getIcon(item: NetworkStationGroup | NetworkFloatingGroup): string {
		if (item._kind === 'station-group') return 'mdi:bicycle';
		const titles = Object.keys(item.byTitle).join(' ').toLowerCase();
		if (titles.includes('scooter')) return 'mdi:scooter-electric';
		if (titles.includes('bike') || titles.includes('bicycle')) return 'mdi:bicycle';
		return 'mdi:map-marker';
	}

	let icon = $derived(getIcon(item));
</script>

<div class="route micromobility-card">
	<h2 style={headerStyle}>
		<span class="micro-icon">
			<iconify-icon {icon} width="1.2em" height="1.2em"></iconify-icon>
		</span>
		<span class="micro-network-name">{item.networkName}</span>
		{#if item._kind === 'station-group'}
			<span class="micro-count">
				{item.stations.length}
				{$_('micromobility.stations', { values: { count: item.stations.length } })}
			</span>
		{/if}
	</h2>

	<div class="micro-body">
		{#if item._kind === 'station-group'}
			{#each item.stations as station (station.id)}
				<div class="micro-station">
					<div class="micro-station-name">{station.title}</div>
					{#if station.subtitle}
						<div class="micro-station-avail">{station.subtitle}</div>
					{/if}
				</div>
			{/each}
		{:else}
			{#each Object.entries(item.byTitle) as [title, count] (title)}
				<div class="micro-vehicle-row">
					{count} {title}{count !== 1 ? 's' : ''} {$_('micromobility.nearby')}
				</div>
			{/each}
		{/if}
	</div>
</div>

<style>
	.micromobility-card {
		width: 100%;
		box-sizing: border-box;
		contain: layout style;
		display: flex;
		flex-direction: column;
	}

	.micromobility-card h2 {
		position: relative;
		padding: 0.35em 0.4em;
		display: flex;
		align-items: center;
		gap: 0.3em;
		line-height: 1em;
		flex-shrink: 0;
		font-weight: 700;
		letter-spacing: -0.02em;
		border-radius: 0.3em 0.3em 0 0;
		margin: 0;
		font-size: 1em;
	}

	.micro-icon {
		display: flex;
		align-items: center;
		flex-shrink: 0;
	}

	.micro-network-name {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.micro-count {
		flex-shrink: 0;
		font-weight: 400;
		font-size: 0.8em;
		opacity: 0.85;
	}

	.micro-body {
		padding: 0.3em 0.4em;
		display: flex;
		flex-direction: column;
		gap: 0.2em;
	}

	.micro-station {
		padding: 0.15em 0;
	}

	.micro-station-name {
		font-weight: 600;
		font-size: 0.85em;
		color: var(--text-primary);
		line-height: 1.2;
	}

	.micro-station-avail {
		font-size: 0.75em;
		color: var(--text-secondary);
		line-height: 1.3;
	}

	.micro-vehicle-row {
		font-size: 0.85em;
		color: var(--text-primary);
		padding: 0.1em 0;
	}
</style>
