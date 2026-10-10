## Q1 Scope: publish the plugin and lane catalog to Protobox prod and `codeloop plugin add <name>`; wiki page writes on hosted servers too, or a child?
recommended: Catalog install this card; hosted wiki page writes a child (cloud sync already covers part).
answer: 

## Q2 Catalog shape: one Protobox pack per plugin, or one codeloop pack with a manifest?
recommended: One `codeloop` pack with a manifest listing plugins and lanes with tarball URLs; install fetches through the Protobox catalog endpoint.
answer: 

## Q3 Acceptance: what proves it?
recommended: Given a workspace with Protobox connected, when `codeloop plugin add ui-shadcn`, then the folder lands in `.codeloop/plugins/`, `init` detects it, and the Protobox catalog shows one install for it.
answer: 

## Q4 Riskiest assumption: Protobox prod is 132 commits behind local and the catalog endpoint is not live.
recommended: Build against local Protobox (4100) with a `catalog_url:` in config; the card is blocked on the Protobox push for its prod acceptance.
answer: 

## Q5 Install auth: anonymous reads of public packs?
recommended: Anonymous read for public packs; writes need the hosted sign-in from c-088.
answer: 
