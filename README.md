# Ticket Indexer for bcash node

This indexer is built as a plugin for the [bcash node](https://github.com/badger-cash/bcash). It indexes tickets according to the [SLP Block Lotto Specification](https://github.com/badger-cash/block-lotto-specification).

## Indexed Data

### Issue Ticket Tx Hash
* By address (player and affiliate are in same table) - deleted when redeemed
* By block number - permanent

### Redeem Tx Hash - contains issue ticket Tx in signature
* By issue ticket tx hash
* By block number (also by range of blocks)
* By address (player and affiliate are in same table)

### Block Header
* By block hash

### Block Hash
* By block number
