# SqueekScope

A community-built, read-only checker for **Squeekchain** on Ethereum Sepolia testnet.

Look up any Sepolia address to see:

- Sepolia ETH balance
- Official SQK token balance
- **Staking account power** (from deposited Squeek NFTs and staked SQK)
- SQK staked by the account and **claimable SQK rewards**
- Squeek NFTs currently held in the wallet

…or look up a single Squeek by token ID to see its custody (wallet vs. deposited in
staking) and who its depositor is.

## How it uses Squeekchain

Everything is read live, in the browser, from Squeekchain's own public surface:

| Data | Source |
| --- | --- |
| Account power, claimable rewards, stake, depositor, total staked | `SqueekStaking` proxy `0x50fd1780526c3186a0c037c7622203bc4fb611ca` via `eth_call` |
| NFT ownership | Squeek collection `0xc4c7982657f00509548f3a3a41db7fa439a6856b` |
| SQK balance | Official SQK token `0xd78a3956cf63164d1fa1c622ad3c66623162fa1e` |
| Protocol stats (round, totals) | Public economy API `https://api.squeekchain.com/v1/economy/state` |
| Wallet NFT enumeration | Blockscout public API (Sepolia) |

No wallet connection, no signing, no backend, no tracking. It complements the official
console at [sepolia.squeekchain.com](https://sepolia.squeekchain.com/) with a fast
single-address summary.

## Run it

It's a static site — open `index.html` or serve the folder with any static host
(GitHub Pages works out of the box):

```sh
python3 -m http.server 8080
```

## License

MIT
