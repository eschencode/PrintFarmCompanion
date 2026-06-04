<script lang="ts">
	import { onMount } from 'svelte';

	// Benefit-focused features, drawn from the actual app surfaces.
	const features = [
		{
			accent: 'var(--accent-blue)',
			title: 'Live farm dashboard',
			desc: 'Every printer on one grid — status, progress, and the loaded spool at a glance. Stop walking the farm to check on a print.'
		},
		{
			accent: 'var(--accent-pink)',
			title: 'Filament & spool tracking',
			desc: 'Track every spool by material, color, weight, and cost. Always know how much filament is on hand and what each gram really costs you.'
		},
		{
			accent: 'var(--accent-orange)',
			title: 'Inventory & stock counts',
			desc: 'Append-only logs keep a precise count of finished goods, with quick stock counts and a 30-day order plan so you reorder before you run dry.'
		},
		{
			accent: 'var(--accent-blue)',
			title: 'Demand forecasting',
			desc: 'Forecasts what to print next from your real sales history, so filament and finished stock are ready before the orders land.'
		},
		{
			accent: 'var(--accent-purple)',
			title: 'Queue & start prints',
			desc: 'Queue jobs and start them across the whole farm — manual, Pi bridge, or direct — from one place, with live start states.'
		},
		{
			accent: 'var(--accent-pink)',
			title: 'Statistics & analytics',
			desc: 'Total runtime, filament usage by color and material, failure analysis, and wasted-cost tracking — the numbers behind the farm.'
		},
		{
			accent: 'var(--accent-orange)',
			title: 'Modules & products',
			desc: 'Define reusable print modules and assemble them into sellable products, so the same part feeds every order it belongs to.'
		},
		{
			accent: 'var(--accent-purple)',
			title: 'Desktop & web app',
			desc: 'Run it in any browser, or as a native desktop app on the shop floor for direct printer control. Your farm, wherever you are.'
		}
	];

	// Pain-framed outcomes — the "why", distinct from the feature list below.
	const pillars = [
		{
			tag: 'Visibility',
			label: 'No more walking the farm',
			desc: 'Check every printer from your desk instead of the shop floor — status and progress, always live.'
		},
		{
			tag: 'Accuracy',
			label: 'No more stockouts',
			desc: 'Filament and finished-goods counts keep themselves current as prints finish and orders ship.'
		},
		{
			tag: 'Foresight',
			label: 'No more guesswork',
			desc: 'Forecasting tells you what to print and when to reorder, before the backlog ever builds up.'
		}
	];

	// The three real transport modes the app supports.
	const transports = [
		{
			accent: 'var(--accent-blue)',
			tag: 'No hardware',
			title: 'Manual mode',
			desc: 'Track any printer by hand with time-based progress. Perfect for older machines or a quick start.'
		},
		{
			accent: 'var(--accent-purple)',
			tag: 'Networked',
			title: 'Pi bridge',
			desc: 'A small Raspberry Pi service relays files and live status to each printer over your local network.'
		},
		{
			accent: 'var(--accent-pink)',
			tag: 'Desktop app',
			title: 'Direct connection',
			desc: 'The desktop app talks straight to your Bambu printers over MQTT — no middleman required.'
		}
	];

	const integrations = ['Bambu Lab', 'Shopify', 'Raspberry Pi', 'Cloudflare', 'Tauri Desktop', 'MQTT'];

	const steps = [
		{
			n: '01',
			accent: 'var(--accent-blue)',
			title: 'Connect your printers',
			desc: 'Set up a Pi bridge or connect directly over your local network. Bambu printers come online in minutes.'
		},
		{
			n: '02',
			accent: 'var(--accent-purple)',
			title: 'Configure your farm',
			desc: 'Add filament materials, build print modules and products, and link integrations like Shopify.'
		},
		{
			n: '03',
			accent: 'var(--accent-pink)',
			title: 'Monitor & manage',
			desc: 'Watch every print, track inventory and costs, and let forecasting tell you what to make next — all from one dashboard.'
		}
	];

	onMount(() => {
		const els = document.querySelectorAll('.reveal');
		if (!('IntersectionObserver' in window)) {
			els.forEach((el) => el.classList.add('is-visible'));
			return;
		}
		const obs = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting) {
						entry.target.classList.add('is-visible');
						obs.unobserve(entry.target);
					}
				}
			},
			{ threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
		);
		els.forEach((el) => obs.observe(el));
		return () => obs.disconnect();
	});
</script>

<svelte:head>
	<title>PrintFarmCompanion — Manage your entire 3D print farm</title>
	<meta
		name="description"
		content="Monitor every printer, track filament and inventory, forecast demand, and sync orders — manage your whole 3D print farm from a single dashboard."
	/>
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link
		href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&display=swap"
		rel="stylesheet"
	/>
</svelte:head>

<div class="frame">
	<div class="page">
		<!-- ░░ Header ░░ -->
		<header class="topbar">
			<div class="brand">
				<span class="brand-dot" aria-hidden="true"></span>
				<span class="brand-name">PrintFarmCompanion</span>
			</div>
			<nav class="topnav">
				<a class="ghost-link" href="/signin">Sign In</a>
				<a class="btn btn-solid" href="/signup">Create Account</a>
			</nav>
		</header>

		<!-- ░░ 1. Hero ░░ -->
		<section class="hero">
			<div class="hero-copy reveal">
				<div class="eyebrow">
					<span class="status-dot" aria-hidden="true"></span>
					Print farm management
				</div>
				<h1>Manage your entire 3D print farm from a single dashboard.</h1>
				<p class="lede">
					Monitor every printer in real time, track filament and inventory down to the gram, and let
					demand forecasting tell you what to make next.
				</p>
				<div class="cta-row">
					<a class="btn btn-solid" href="/signup">Create Account</a>
					<a class="btn btn-ghost" href="/signin">Sign In</a>
				</div>
			</div>

			<div class="hero-shot reveal">
				<div class="shot-frame">
					<div class="shot-bar" aria-hidden="true">
						<span></span><span></span><span></span>
					</div>
					<img src="/images/screen.png" alt="PrintFarmCompanion dashboard showing a grid of printers with live status and progress" />
				</div>
				<div class="shot-glow" aria-hidden="true"></div>
			</div>
		</section>

		<!-- ░░ Value pillars ░░ -->
		<section class="pillars-wrap">
			<div class="pillars">
				{#each pillars as p, i}
					<div class="pillar reveal" style="--delay:{i * 80}ms">
						<span class="pillar-stat">{p.tag}</span>
						<h3>{p.label}</h3>
						<p>{p.desc}</p>
					</div>
				{/each}
			</div>
		</section>

		<!-- ░░ 2. Feature showcase ░░ -->
		<section class="block">
			<div class="block-head reveal">
				<h2>Everything the farm needs, in one place</h2>
				<p class="block-sub">
					From the printers on the floor to the orders going out the door — every part of the
					operation, connected.
				</p>
			</div>

			<div class="feature-grid">
				{#each features as f, i}
					<article class="card feature-card reveal" style="--accent:{f.accent}; --delay:{(i % 4) * 60}ms">
						<span class="card-bar" aria-hidden="true"></span>
						<div class="feature-icon" aria-hidden="true">
							{#if f.title === 'Live farm dashboard'}
								<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="13" rx="1.5"/><path d="M8 21h8M12 17v4"/></svg>
							{:else if f.title === 'Desktop & web app'}
								<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="11" rx="1.5"/><path d="M2 20h20M9 16v4M15 16v4"/></svg>
							{:else if f.title === 'Filament & spool tracking'}
								<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3"/><path d="M12 3.5v3M20.5 12h-3"/></svg>
							{:else if f.title === 'Inventory & stock counts'}
								<svg viewBox="0 0 24 24"><path d="M3 8l9-4 9 4-9 4-9-4z"/><path d="M3 8v8l9 4 9-4V8M12 12v8"/></svg>
							{:else if f.title === 'Demand forecasting'}
								<svg viewBox="0 0 24 24"><path d="M4 19V5M4 19h16"/><path d="M7 15l4-5 3 3 5-7"/></svg>
							{:else if f.title === 'Queue & start prints'}
								<svg viewBox="0 0 24 24"><path d="M4 7h10M4 12h10M4 17h6"/><path d="M16 9l5 3-5 3V9z"/></svg>
							{:else if f.title === 'Statistics & analytics'}
								<svg viewBox="0 0 24 24"><path d="M4 20V4"/><path d="M4 20h16"/><rect x="8" y="11" width="3" height="6"/><rect x="14" y="7" width="3" height="10"/></svg>
							{:else}
								<svg viewBox="0 0 24 24"><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z"/><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5"/></svg>
							{/if}
						</div>
						<h3>{f.title}</h3>
						<p>{f.desc}</p>
					</article>
				{/each}
			</div>
		</section>

		<!-- ░░ Shopify spotlight ░░ -->
		<section class="block">
			<div class="card shopify-spot reveal">
				<div class="shopify-copy">
					<span class="spot-eyebrow">
						<span class="spot-dot" aria-hidden="true"></span>
						Shopify integration
					</span>
					<h2>Your store and your farm, in sync</h2>
					<p class="spot-lede">
						Connect Shopify once and every sale flows straight into the farm. Inventory deducts
						itself, forecasting reacts, and you print to meet real demand — no spreadsheets, no
						overselling.
					</p>
					<ul class="check-list">
						<li>Orders sync automatically — no manual entry, no CSV exports.</li>
						<li>Inventory deducts the moment an item sells, so stock stays accurate.</li>
						<li>Forecasting sees real sales and tells you what to print next.</li>
						<li>Map each SKU to a product once — it stays linked from then on.</li>
					</ul>
					<div class="cta-row">
						<a class="btn btn-solid" href="/signup">Connect your store</a>
					</div>
				</div>

				<div class="flow" aria-hidden="true">
					<div class="flow-node">
						<span class="flow-icon">
							<svg viewBox="0 0 24 24"><path d="M6 8h12l-1 12H7L6 8z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>
						</span>
						<div class="flow-text"><strong>Sale on Shopify</strong><span>A customer checks out</span></div>
					</div>
					<span class="flow-arrow"><svg viewBox="0 0 24 24"><path d="M12 4v16M6 14l6 6 6-6"/></svg></span>

					<div class="flow-node">
						<span class="flow-icon">
							<svg viewBox="0 0 24 24"><path d="M3 8l9-4 9 4-9 4-9-4z"/><path d="M3 8v8l9 4 9-4V8"/><path d="M9 13h6"/></svg>
						</span>
						<div class="flow-text"><strong>Inventory deducts</strong><span>Stock updates on its own</span></div>
					</div>
					<span class="flow-arrow"><svg viewBox="0 0 24 24"><path d="M12 4v16M6 14l6 6 6-6"/></svg></span>

					<div class="flow-node">
						<span class="flow-icon">
							<svg viewBox="0 0 24 24"><path d="M4 19V5M4 19h16"/><path d="M7 15l4-5 3 3 5-7"/></svg>
						</span>
						<div class="flow-text"><strong>Forecast updates</strong><span>Knows what's running low</span></div>
					</div>
					<span class="flow-arrow"><svg viewBox="0 0 24 24"><path d="M12 4v16M6 14l6 6 6-6"/></svg></span>

					<div class="flow-node">
						<span class="flow-icon">
							<svg viewBox="0 0 24 24"><rect x="5" y="9" width="14" height="8" rx="1.5"/><path d="M8 9V5h8v4M8 17v2h8v-2"/></svg>
						</span>
						<div class="flow-text"><strong>Print &amp; restock</strong><span>Make exactly what sold</span></div>
					</div>

					<div class="flow-loop">
						<svg viewBox="0 0 24 24"><path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5"/></svg>
						Repeats automatically on every order
					</div>
				</div>
			</div>
		</section>

		<!-- ░░ Transport modes ░░ -->
		<section class="block">
			<div class="block-head reveal">
				<h2>Connect the farm your way</h2>
				<p class="block-sub">
					Three ways to bring printers online — mix and match across the farm, no two machines need
					the same setup.
				</p>
			</div>

			<div class="transports">
				{#each transports as t, i}
					<article class="card transport-card reveal" style="--accent:{t.accent}; --delay:{i * 80}ms">
						<span class="transport-tag">{t.tag}</span>
						<h3>{t.title}</h3>
						<p>{t.desc}</p>
						<span class="transport-line" aria-hidden="true"></span>
					</article>
				{/each}
			</div>
		</section>

		<!-- ░░ 3. How it works ░░ -->
		<section class="block">
			<div class="block-head reveal">
				<h2>How it works</h2>
				<p class="block-sub">Three steps from bare printers to a fully managed farm.</p>
			</div>

			<div class="steps">
				{#each steps as s, i}
					<div class="card step-card reveal" style="--accent:{s.accent}; --delay:{i * 90}ms">
						<span class="step-bar" aria-hidden="true"></span>
						<span class="step-num">{s.n}</span>
						<h3>{s.title}</h3>
						<p>{s.desc}</p>
					</div>
				{/each}
			</div>
		</section>

		<!-- ░░ Integrations strip ░░ -->
		<section class="block integrations-block">
			<div class="reveal int-head">
				<span class="int-label">Works with the tools you already run</span>
				<div class="int-row">
					{#each integrations as name}
						<span class="int-pill">{name}</span>
					{/each}
				</div>
			</div>
		</section>

		<!-- ░░ 4. Closing CTA ░░ -->
		<section class="block">
			<div class="card cta-card reveal">
				<h2>Start managing your print farm today.</h2>
				<p>One dashboard for every printer, spool, and order. No more spreadsheets.</p>
				<div class="cta-row center">
					<a class="btn btn-solid" href="/signup">Create Account</a>
					<a class="btn btn-ghost" href="/signin">Sign In</a>
				</div>
			</div>
		</section>

		<!-- ░░ 5. Footer ░░ -->
		<footer class="footer">
			<div class="brand">
				<span class="brand-dot" aria-hidden="true"></span>
				<span class="brand-name">PrintFarmCompanion</span>
			</div>
			<div class="footer-links">
				<a href="/signin">Sign In</a>
				<a href="/signup">Create Account</a>
			</div>
			<span class="footer-copy">© {new Date().getFullYear()} PrintFarmCompanion</span>
		</footer>
	</div>
</div>

<style>
	:global(html) {
		scroll-behavior: smooth;
	}
	:global(html),
	:global(body) {
		margin: 0;
		padding: 0;
		background: #0a0a0a;
	}

	.frame {
		--bg: #0a0a0a;
		--surface: #161616;
		--surface-2: #121212;
		--border: #2a2a2a;
		--border-soft: #222;
		--text: #f4f4f5;
		--text-muted: #999;
		--text-dim: #6f6f72;
		--green: #22c55e;
		--accent-pink: #ec4899;
		--accent-blue: #3b82f6;
		--accent-orange: #f97316;
		--accent-purple: #8b5cf6;
		--radius: 12px;
		--radius-lg: 16px;
		--maxw: 1180px;

		font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
		background: var(--bg);
		color: var(--text);
		min-height: 100vh;
		box-sizing: border-box;
		-webkit-font-smoothing: antialiased;
	}

	.frame :global(*) {
		box-sizing: border-box;
	}

	.page {
		background: var(--bg);
		overflow: hidden;
		padding: clamp(18px, 4vw, 40px) clamp(16px, 4vw, 48px) 0;
	}

	/* ── Header ── */
	.topbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		max-width: var(--maxw);
		margin: 0 auto;
		padding: 6px 0 28px;
	}
	.brand {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.brand-dot {
		width: 10px;
		height: 10px;
		border-radius: 3px;
		background: linear-gradient(140deg, var(--accent-blue), var(--accent-purple));
	}
	.brand-name {
		font-weight: 500;
		font-size: 0.95rem;
		letter-spacing: -0.01em;
	}
	.topnav {
		display: flex;
		align-items: center;
		gap: 18px;
	}
	.ghost-link {
		color: var(--text-muted);
		text-decoration: none;
		font-size: 0.9rem;
		transition: color 0.2s ease;
	}
	.ghost-link:hover {
		color: var(--text);
	}

	/* ── Buttons ── */
	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		text-decoration: none;
		font-size: 0.92rem;
		font-weight: 500;
		padding: 0.62rem 1.15rem;
		border-radius: 9px;
		border: 1px solid transparent;
		transition: transform 0.15s ease, background 0.2s ease, border-color 0.2s ease, color 0.2s ease;
		white-space: nowrap;
	}
	.btn:active {
		transform: translateY(1px);
	}
	.btn-solid {
		background: var(--text);
		color: #0a0a0a;
	}
	.btn-solid:hover {
		background: #fff;
	}
	.btn-ghost {
		background: transparent;
		color: var(--text);
		border-color: var(--border);
	}
	.btn-ghost:hover {
		border-color: #3a3a3a;
		background: #161616;
	}

	/* ── Hero ── */
	.hero {
		max-width: var(--maxw);
		margin: 0 auto;
		display: grid;
		grid-template-columns: 1.05fr 1fr;
		gap: clamp(28px, 5vw, 64px);
		align-items: center;
		padding: clamp(28px, 6vw, 72px) 0 clamp(40px, 8vw, 96px);
	}
	.eyebrow {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		font-size: 0.78rem;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--text-muted);
		margin-bottom: 22px;
	}
	.status-dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--green);
		box-shadow: 0 0 8px 1px rgba(34, 197, 94, 0.5);
	}
	.hero h1 {
		font-size: clamp(2rem, 4.6vw, 3.4rem);
		line-height: 1.05;
		font-weight: 300;
		letter-spacing: -0.02em;
		margin: 0 0 22px;
	}
	.lede {
		color: var(--text-muted);
		font-size: clamp(1rem, 1.4vw, 1.12rem);
		line-height: 1.6;
		max-width: 30em;
		margin: 0 0 32px;
	}
	.cta-row {
		display: flex;
		gap: 12px;
		flex-wrap: wrap;
	}
	.cta-row.center {
		justify-content: center;
	}

	/* ── Hero screenshot ── */
	.hero-shot {
		position: relative;
	}
	.shot-frame {
		position: relative;
		z-index: 1;
		background: var(--surface-2);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		overflow: hidden;
		box-shadow: 0 30px 70px -30px rgba(0, 0, 0, 0.8);
	}
	.shot-bar {
		display: flex;
		gap: 7px;
		padding: 11px 14px;
		border-bottom: 1px solid var(--border-soft);
		background: #101010;
	}
	.shot-bar span {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: #2c2c2c;
	}
	.shot-frame img {
		display: block;
		width: 100%;
		height: auto;
	}
	.shot-glow {
		position: absolute;
		inset: 10% 6% -12% 6%;
		z-index: 0;
		background: radial-gradient(ellipse at center, rgba(59, 130, 246, 0.18), transparent 70%);
		filter: blur(40px);
	}

	/* ── Section blocks ── */
	.block {
		max-width: var(--maxw);
		margin: 0 auto;
		padding: clamp(40px, 8vw, 88px) 0;
	}
	.block-head {
		max-width: 36em;
		margin: 0 0 clamp(28px, 5vw, 52px);
	}
	.block-head h2 {
		font-size: clamp(1.6rem, 3vw, 2.3rem);
		font-weight: 300;
		letter-spacing: -0.02em;
		margin: 0 0 14px;
	}
	.block-sub {
		color: var(--text-muted);
		font-size: 1.02rem;
		line-height: 1.55;
		margin: 0;
	}

	/* ── Value pillars ── */
	.pillars-wrap {
		border-top: 1px solid var(--border-soft);
		border-bottom: 1px solid var(--border-soft);
		background: var(--surface-2);
	}
	.pillars {
		max-width: var(--maxw);
		margin: 0 auto;
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: clamp(20px, 4vw, 48px);
		padding: clamp(32px, 5vw, 56px) 0;
	}
	.pillar {
		position: relative;
		padding-left: 18px;
	}
	.pillar::before {
		content: '';
		position: absolute;
		left: 0;
		top: 4px;
		bottom: 4px;
		width: 2px;
		border-radius: 2px;
		background: linear-gradient(var(--accent-blue), var(--accent-purple));
	}
	.pillar-stat {
		display: block;
		font-size: 0.8rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--accent-blue);
		margin-bottom: 12px;
	}
	.pillar h3 {
		font-size: 1.12rem;
		font-weight: 500;
		letter-spacing: -0.01em;
		margin: 0 0 9px;
	}
	.pillar p {
		color: var(--text-muted);
		font-size: 0.92rem;
		line-height: 1.55;
		margin: 0;
	}

	/* ── Transport cards ── */
	.transports {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 16px;
	}
	.transport-card {
		position: relative;
		padding: 28px 26px 30px;
		overflow: hidden;
		transition: transform 0.25s ease, border-color 0.25s ease;
	}
	.transport-card:hover {
		transform: translateY(-3px);
		border-color: #383838;
	}
	.transport-tag {
		display: inline-block;
		font-size: 0.72rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--accent);
		border: 1px solid color-mix(in srgb, var(--accent) 35%, transparent);
		background: color-mix(in srgb, var(--accent) 10%, transparent);
		border-radius: 6px;
		padding: 3px 8px;
		margin-bottom: 18px;
	}
	.transport-card h3 {
		font-size: 1.18rem;
		font-weight: 400;
		letter-spacing: -0.01em;
		margin: 0 0 11px;
	}
	.transport-card p {
		color: var(--text-muted);
		font-size: 0.92rem;
		line-height: 1.6;
		margin: 0;
	}
	.transport-line {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		height: 2px;
		background: linear-gradient(90deg, var(--accent), transparent);
	}

	/* ── Integrations strip ── */
	.integrations-block {
		padding-top: 0;
	}
	.int-head {
		text-align: center;
		border-top: 1px solid var(--border-soft);
		padding-top: clamp(36px, 6vw, 64px);
	}
	.int-label {
		display: block;
		color: var(--text-dim);
		font-size: 0.82rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		margin-bottom: 22px;
	}
	.int-row {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 12px;
	}
	.int-pill {
		font-size: 0.9rem;
		color: var(--text-muted);
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 999px;
		padding: 8px 16px;
		transition: color 0.2s ease, border-color 0.2s ease;
	}
	.int-pill:hover {
		color: var(--text);
		border-color: #3a3a3a;
	}

	/* ── Shopify spotlight ── */
	.shopify-spot {
		display: grid;
		grid-template-columns: 1.1fr 0.9fr;
		gap: clamp(32px, 5vw, 64px);
		align-items: center;
		padding: clamp(32px, 5vw, 56px);
		background:
			radial-gradient(ellipse at 85% 10%, rgba(139, 92, 246, 0.12), transparent 55%),
			var(--surface);
	}
	.spot-eyebrow {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		font-size: 0.78rem;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--text-muted);
		margin-bottom: 18px;
	}
	.spot-dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--accent-purple);
		box-shadow: 0 0 8px 1px rgba(139, 92, 246, 0.6);
	}
	.shopify-copy h2 {
		font-size: clamp(1.5rem, 2.8vw, 2.2rem);
		font-weight: 300;
		letter-spacing: -0.02em;
		margin: 0 0 16px;
	}
	.spot-lede {
		color: var(--text-muted);
		font-size: 1.02rem;
		line-height: 1.6;
		margin: 0 0 26px;
	}
	.check-list {
		list-style: none;
		margin: 0 0 30px;
		padding: 0;
		display: grid;
		gap: 13px;
	}
	.check-list li {
		position: relative;
		padding-left: 30px;
		color: var(--text);
		font-size: 0.95rem;
		line-height: 1.5;
	}
	.check-list li::before {
		content: '';
		position: absolute;
		left: 0;
		top: 1px;
		width: 19px;
		height: 19px;
		border-radius: 50%;
		background: color-mix(in srgb, var(--accent-purple) 18%, transparent);
		border: 1px solid color-mix(in srgb, var(--accent-purple) 45%, transparent);
	}
	.check-list li::after {
		content: '';
		position: absolute;
		left: 6px;
		top: 6px;
		width: 7px;
		height: 4px;
		border-left: 1.6px solid var(--accent-purple);
		border-bottom: 1.6px solid var(--accent-purple);
		transform: rotate(-45deg);
	}

	/* Shopify flow diagram */
	.flow {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.flow-node {
		display: flex;
		align-items: center;
		gap: 14px;
		background: var(--surface-2);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 14px 16px;
	}
	.flow-icon {
		flex-shrink: 0;
		width: 40px;
		height: 40px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 9px;
		background: color-mix(in srgb, var(--accent-purple) 14%, var(--surface));
		border: 1px solid color-mix(in srgb, var(--accent-purple) 30%, transparent);
	}
	.flow-icon svg {
		width: 20px;
		height: 20px;
		fill: none;
		stroke: var(--accent-purple);
		stroke-width: 1.6;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.flow-text {
		display: flex;
		flex-direction: column;
		line-height: 1.3;
	}
	.flow-text strong {
		font-weight: 500;
		font-size: 0.95rem;
	}
	.flow-text span {
		color: var(--text-muted);
		font-size: 0.82rem;
	}
	.flow-arrow {
		display: flex;
		justify-content: center;
		height: 22px;
	}
	.flow-arrow svg {
		width: 18px;
		height: 18px;
		fill: none;
		stroke: var(--text-dim);
		stroke-width: 1.6;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.flow-loop {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 9px;
		margin-top: 14px;
		padding: 11px 16px;
		border: 1px dashed color-mix(in srgb, var(--accent-purple) 40%, transparent);
		border-radius: 999px;
		color: var(--text-muted);
		font-size: 0.85rem;
	}
	.flow-loop svg {
		width: 16px;
		height: 16px;
		fill: none;
		stroke: var(--accent-purple);
		stroke-width: 1.6;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	/* ── Cards ── */
	.card {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
	}

	/* ── Feature grid ── */
	.feature-grid {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 16px;
	}
	.feature-card {
		position: relative;
		padding: 26px 22px 24px;
		overflow: hidden;
		transition: transform 0.25s ease, border-color 0.25s ease;
	}
	.feature-card:hover {
		transform: translateY(-3px);
		border-color: #383838;
	}
	.card-bar {
		position: absolute;
		left: 0;
		top: 16px;
		bottom: 16px;
		width: 3px;
		border-radius: 0 3px 3px 0;
		background: var(--accent);
	}
	.feature-icon {
		width: 38px;
		height: 38px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 9px;
		border: 1px solid var(--border);
		background: #1c1c1c;
		margin-bottom: 18px;
	}
	.feature-icon svg {
		width: 20px;
		height: 20px;
		fill: none;
		stroke: var(--accent);
		stroke-width: 1.6;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.feature-card h3 {
		font-size: 1rem;
		font-weight: 500;
		margin: 0 0 9px;
		letter-spacing: -0.01em;
	}
	.feature-card p {
		color: var(--text-muted);
		font-size: 0.88rem;
		line-height: 1.55;
		margin: 0;
	}

	/* ── Steps ── */
	.steps {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 16px;
	}
	.step-card {
		position: relative;
		padding: 30px 26px;
		overflow: hidden;
		transition: transform 0.25s ease, border-color 0.25s ease;
	}
	.step-card:hover {
		transform: translateY(-3px);
		border-color: #383838;
	}
	.step-bar {
		position: absolute;
		left: 0;
		top: 0;
		right: 0;
		height: 2px;
		background: linear-gradient(90deg, var(--accent), transparent);
	}
	.step-num {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		font-size: 0.82rem;
		font-weight: 600;
		letter-spacing: 0.06em;
		color: var(--accent);
		border: 1px solid color-mix(in srgb, var(--accent) 35%, transparent);
		background: color-mix(in srgb, var(--accent) 12%, transparent);
		border-radius: 7px;
		padding: 4px 9px;
		margin-bottom: 20px;
	}
	.step-card h3 {
		font-size: 1.18rem;
		font-weight: 400;
		letter-spacing: -0.01em;
		margin: 0 0 12px;
	}
	.step-card p {
		color: var(--text-muted);
		font-size: 0.95rem;
		line-height: 1.6;
		margin: 0;
	}

	/* ── Closing CTA ── */
	.cta-card {
		text-align: center;
		padding: clamp(40px, 7vw, 72px) 24px;
		background:
			radial-gradient(ellipse at 50% 0%, rgba(139, 92, 246, 0.1), transparent 60%),
			var(--surface);
	}
	.cta-card h2 {
		font-size: clamp(1.5rem, 3vw, 2.2rem);
		font-weight: 300;
		letter-spacing: -0.02em;
		margin: 0 0 14px;
	}
	.cta-card p {
		color: var(--text-muted);
		font-size: 1.05rem;
		margin: 0 0 30px;
	}

	/* ── Footer ── */
	.footer {
		max-width: var(--maxw);
		margin: 0 auto;
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 16px;
		padding: 36px 0;
		border-top: 1px solid var(--border-soft);
	}
	.footer-links {
		display: flex;
		gap: 22px;
	}
	.footer-links a {
		color: var(--text-muted);
		text-decoration: none;
		font-size: 0.9rem;
		transition: color 0.2s ease;
	}
	.footer-links a:hover {
		color: var(--text);
	}
	.footer-copy {
		color: var(--text-dim);
		font-size: 0.85rem;
	}

	/* ── Scroll reveal ── */
	.reveal {
		opacity: 0;
		transform: translateY(18px);
		transition: opacity 0.6s ease, transform 0.6s cubic-bezier(0.16, 1, 0.3, 1);
		transition-delay: var(--delay, 0ms);
	}
	.reveal:global(.is-visible) {
		opacity: 1;
		transform: none;
	}
	@media (prefers-reduced-motion: reduce) {
		:global(html) {
			scroll-behavior: auto;
		}
		.reveal {
			opacity: 1;
			transform: none;
			transition: none;
		}
	}

	/* ── Responsive ── */
	@media (max-width: 980px) {
		.hero {
			grid-template-columns: 1fr;
		}
		.feature-grid {
			grid-template-columns: repeat(2, 1fr);
		}
	}
	@media (max-width: 760px) {
		.pillars,
		.transports,
		.steps {
			grid-template-columns: 1fr;
		}
		.pillars {
			gap: 26px;
		}
		.shopify-spot {
			grid-template-columns: 1fr;
		}
	}
	@media (max-width: 620px) {
		.feature-grid {
			grid-template-columns: 1fr;
		}
		.topnav .ghost-link {
			display: none;
		}
		.btn {
			flex: 1;
		}
		.cta-row {
			width: 100%;
		}
		.footer {
			flex-direction: column;
			align-items: flex-start;
			gap: 18px;
		}
	}
	@media (max-width: 400px) {
		.hero h1 {
			font-size: 1.85rem;
		}
		.int-row {
			gap: 8px;
		}
	}
</style>
