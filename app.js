// SqueekScope — read-only Squeekchain (Sepolia) portfolio & staking checker.
// All data is read live from the official contracts via a public Sepolia RPC,
// the public Squeekchain economy API, and Blockscout's public API. No wallet,
// no signing, no tracking.

const RPC = "https://ethereum-sepolia-rpc.publicnode.com";
const ECONOMY = "https://api.squeekchain.com/v1/economy/state";
const BLOCKSCOUT = "https://eth-sepolia.blockscout.com/api/v2";

const COLLECTION = "0xc4c7982657f00509548f3a3a41db7fa439a6856b"; // official Squeek NFT
const STAKING    = "0x50fd1780526c3186a0c037c7622203bc4fb611ca"; // SqueekStaking (proxy)
const SQK        = "0xd78a3956cf63164d1fa1c622ad3c66623162fa1e"; // official SQK token

// Function selectors (keccak256(signature)[0..4])
const SEL = {
  balanceOf:    "0x70a08231", // balanceOf(address) — ERC-20/721
  ownerOf:      "0x6352211e", // ownerOf(uint256)
  totalStaked:  "0x817b1cd2", // totalStaked()
  accountPower: "0x9624178f", // accountPower(address) -> (uint256, uint256)
  claimable:    "0x402914f5", // claimable(address)
  stakeOf:      "0x42623360", // stakeOf(address) -> (uint256, uint256, uint64)
  depositor:    "0x5e020ebb", // depositor(address, uint256)
};

const $ = (id) => document.getElementById(id);
const padAddr = (a) => a.toLowerCase().replace("0x", "").padStart(64, "0");
const padUint = (n) => BigInt(n).toString(16).padStart(64, "0");
const fmt = (units, dec = 18) => {
  const v = Number(BigInt(units)) / 10 ** dec;
  return v.toLocaleString("en-US", { maximumFractionDigits: 4 });
};
const short = (a) => a.slice(0, 6) + "…" + a.slice(-4);

let rpcId = 0;
async function rpc(method, params) {
  const r = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error.message || "RPC error");
  return j.result;
}
const call = (to, data) => rpc("eth_call", [{ to, data }, "latest"]);
const words = (hex) => {
  const out = [];
  for (let i = 2; i + 64 <= hex.length; i += 64) out.push(BigInt("0x" + hex.slice(i, i + 64)));
  return out;
};
const wordAddr = (hex, idx = 0) => "0x" + hex.slice(2 + idx * 64 + 24, 2 + (idx + 1) * 64);

// ---------- protocol stats ----------
async function loadStats() {
  try {
    const r = await fetch(ECONOMY);
    const j = await r.json();
    const staking = j?.staking ?? {};
    $("st-status").textContent = staking.paused ? "Paused" : (staking.launchReady ? "Live" : "Available");
    $("st-round").textContent = j?.lifecycle?.currentRound ?? "—";
    $("st-power").textContent = staking.totalNftPower ? (BigInt(staking.totalNftPower) / (10n ** 18n)).toLocaleString("en-US") : "—";
    $("st-sqk").textContent = staking.totalStakedBaseUnits ? fmt(staking.totalStakedBaseUnits) : "—";
  } catch {
    // Fallback: read totalStaked straight from the staking contract.
    try {
      const [ts] = words(await call(STAKING, SEL.totalStaked));
      $("st-sqk").textContent = fmt(ts);
      $("st-status").textContent = "Live (RPC)";
    } catch { $("st-status").textContent = "Unavailable"; }
  }
}

// ---------- address lookup ----------
async function lookup() {
  const a = $("addr").value.trim();
  const box = $("result");
  if (!/^0x[0-9a-fA-F]{40}$/.test(a)) { box.innerHTML = '<p class="err">That does not look like a valid address.</p>'; return; }
  $("go").disabled = true;
  box.innerHTML = '<p class="note">Reading live data…</p>';
  try {
    const [ethHex, sqkHex, powHex, clHex, stakeHex] = await Promise.all([
      rpc("eth_getBalance", [a, "latest"]),
      call(SQK, SEL.balanceOf + padAddr(a)),
      call(STAKING, SEL.accountPower + padAddr(a)),
      call(STAKING, SEL.claimable + padAddr(a)),
      call(STAKING, SEL.stakeOf + padAddr(a)),
    ]);
    const power = words(powHex)[0] ?? 0n;
    const stake = words(stakeHex);
    let rows = [
      ["Sepolia ETH balance", fmt(BigInt(ethHex)) + " ETH"],
      ["SQK balance (official token)", fmt(words(sqkHex)[0] ?? 0n) + " SQK"],
      ["Staking account power", (power / (10n ** 18n)).toLocaleString("en-US")],
      ["SQK staked by this account", fmt(stake[0] ?? 0n) + " SQK"],
      ["Claimable SQK rewards", fmt(words(clHex)[0] ?? 0n) + " SQK"],
    ];
    // Squeek NFTs currently sitting in the wallet (Blockscout enumeration).
    let nftHtml = '<p class="note">NFT list unavailable right now.</p>';
    try {
      const r = await fetch(`${BLOCKSCOUT}/addresses/${a}/tokens?type=ERC-721`);
      const j = await r.json();
      const mine = (j.items || []).filter((i) => i.token.address_hash.toLowerCase() === COLLECTION);
      if (!mine.length) nftHtml = '<p class="note">No Squeek NFTs in this wallet (deposited ones are held by the staking contract — power above reflects them).</p>';
      else {
        const ids = [];
        for (const i of mine) {
          const rr = await fetch(`${BLOCKSCOUT}/addresses/${a}/nfts?token_contract_address_hashes=${COLLECTION}`);
          const jj = await rr.json();
          for (const n of jj.items || []) ids.push(n.id);
          break;
        }
        nftHtml = "<p>" + ids.map((id) => `<span class="pill">Squeek #${id}</span>`).join("") + "</p>";
        nftHtml += '<p class="note">Wallet custody only. Deposit a Squeek from the <a href="https://sepolia.squeekchain.com/squeeks" target="_blank" rel="noopener">official Portfolio page</a> to start earning power.</p>';
      }
    } catch { /* keep fallback note */ }
    box.innerHTML =
      `<table>${rows.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join("")}</table>` +
      `<h3>Squeek NFTs in wallet</h3>${nftHtml}`;
  } catch (e) {
    box.innerHTML = `<p class="err">Lookup failed: ${e.message}</p>`;
  }
  $("go").disabled = false;
}

// ---------- single token lookup ----------
async function lookupToken() {
  const t = $("tid").value.trim();
  const box = $("tokenResult");
  if (!/^\d+$/.test(t)) { box.innerHTML = '<p class="err">Enter a numeric token ID.</p>'; return; }
  $("go2").disabled = true;
  box.innerHTML = '<p class="note">Reading live data…</p>';
  try {
    const [ownHex, depHex] = await Promise.all([
      call(COLLECTION, SEL.ownerOf + padUint(t)),
      call(STAKING, SEL.depositor + padAddr(COLLECTION) + padUint(t)),
    ]);
    const owner = wordAddr(ownHex);
    const dep = wordAddr(depHex);
    const zero = "0x0000000000000000000000000000000000000000";
    const custody = owner.toLowerCase() === STAKING ? "Deposited in Staking" : "In a wallet";
    let rows = [
      ["Token", "Squeek #" + t],
      ["Custody", custody],
      ["Current holder", short(owner) + (owner.toLowerCase() === STAKING ? " (SqueekStaking)" : "")],
    ];
    if (dep !== zero) rows.push(["Depositor (earns the power)", short(dep)]);
    box.innerHTML = `<table>${rows.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join("")}</table>`;
  } catch (e) {
    box.innerHTML = `<p class="err">Token lookup failed (does #${t} exist?): ${e.message}</p>`;
  }
  $("go2").disabled = false;
}

// ---------- merge planner ----------
// Official protocol tables (economy state, nft.basePower / nft.cooldownBlocks).
const BASE_POWER = [1000, 2200, 4840, 10648, 23426, 51536, 113380, 249436, 548759, 1207269];
const COOLDOWN_BLOCKS = [0, 3000, 7000, 14000, 21000, 28000, 35000, 42000, 49000, 0];
function planMerge() {
  const a = Number($("lvlA").value), b = Number($("lvlB").value);
  const box = $("mergeResult");
  if (a !== b) { box.innerHTML = '<p class="err">Merges need two Squeeks of the SAME level — these two would be rejected by the contract.</p>'; return; }
  if (a >= 10) { box.innerHTML = '<p class="note">Level 10 is terminal: no further merge is possible.</p>'; return; }
  const before = 2 * BASE_POWER[a - 1];
  const after = BASE_POWER[a]; // level a+1
  const gain = (((after - before) / before) * 100).toFixed(1);
  const cd = COOLDOWN_BLOCKS[a]; // cooldown that applies at the new level (index = new level - 1)
  const hours = (cd * 12 / 3600).toFixed(1);
  box.innerHTML = `<table>
    <tr><th>Survivor becomes</th><td>Level ${a + 1} (donor Squeek is burned)</td></tr>
    <tr><th>Power before</th><td>${before.toLocaleString("en-US")} (2 × Level ${a})</td></tr>
    <tr><th>Power after</th><td>${after.toLocaleString("en-US")} (${gain}% vs. holding both)</td></tr>
    <tr><th>Next merge cooldown</th><td>${cd.toLocaleString("en-US")} blocks (≈ ${hours} hours at 12s/block)</td></tr>
  </table>
  <p class="note">Merging is done from the official Portfolio page; both Squeeks must be in the same custody (both in wallet or both deposited).</p>`;
}
for (const id of ["lvlA", "lvlB"]) {
  const sel = $(id);
  for (let L = 1; L <= 10; L++) {
    const o = document.createElement("option");
    o.value = L; o.textContent = "Level " + L;
    sel.appendChild(o);
  }
}
$("go3").addEventListener("click", planMerge);

$("ft-stk").textContent = short(STAKING);
$("ft-col").textContent = short(COLLECTION);
$("ft-sqk").textContent = short(SQK);
$("go").addEventListener("click", lookup);
$("go2").addEventListener("click", lookupToken);
$("addr").addEventListener("keydown", (e) => { if (e.key === "Enter") lookup(); });
$("tid").addEventListener("keydown", (e) => { if (e.key === "Enter") lookupToken(); });
loadStats();
