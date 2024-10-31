# Ticket Indexer for bcash node
[bcash node](https://github.com/badger-cash/bcash)
A "Ticket" contains two transactions: "issue" and "redeem".

## Indexed Data

### Issue Ticket Tx Hash
* By address (player and affiliate are in same table) - deleted when redeemed
* By block number - permanent

### Redeem Tx Hash - contains issue ticket Tx in signature
* By issue ticket tx hash
* By block number (also select by range for jackpots)
* By address (player and affiliate are in same table)

### Block Header
* By block hash

### Block Hash
* By block number
