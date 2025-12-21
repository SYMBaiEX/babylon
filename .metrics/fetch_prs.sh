#!/usr/bin/env bash
set -euo pipefail
OWNER="BabylonSocial"
REPO="babylon"
OUT="${1:-.metrics/prs.jsonl}"
: > "$OUT"
cursor=null
while :; do
  resp=""
  for attempt in 1 2 3 4 5; do
    if resp=$(gh api graphql -f owner="$OWNER" -f name="$REPO" -F cursor="$cursor" -f query='query($owner:String!,$name:String!,$cursor:String){
    repository(owner:$owner,name:$name){
      pullRequests(first:100, after:$cursor, orderBy:{field:CREATED_AT,direction:ASC}, states:[OPEN,CLOSED,MERGED]){
        nodes{
          number
          url
          title
          state
          createdAt
          mergedAt
          closedAt
          additions
          deletions
          changedFiles
          author{ login }
          baseRefName
          headRefName
        }
        pageInfo{ hasNextPage endCursor }
      }
    }
  }'); then
      break
    fi
    sleep $((attempt * 2))
  done

  if [[ -z "$resp" ]]; then
    echo "Failed to fetch PR page after retries" >&2
    exit 1
  fi

  echo "$resp" | jq -c '.data.repository.pullRequests.nodes[]' >> "$OUT"

  hasNext=$(echo "$resp" | jq -r '.data.repository.pullRequests.pageInfo.hasNextPage')
  cursor=$(echo "$resp" | jq -r '.data.repository.pullRequests.pageInfo.endCursor')
  if [[ "$hasNext" != "true" || "$cursor" == "null" ]]; then
    break
  fi
  cursor="$cursor"
done

wc -l "$OUT" >&2
