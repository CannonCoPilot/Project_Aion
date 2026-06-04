#!/usr/bin/env bash
# unsplash-images.sh — Search, validate, download, and upload stock images
# Used by content-writer persona for blog post images
#
# Usage:
#   source .claude/jobs/lib/unsplash-images.sh
#   unsplash_search "goldendoodle puppy crate" 5
#   unsplash_download "PHOTO_ID" "/tmp/my-image.jpg"
#   wp_upload_image "/tmp/my-image.jpg" "Alt text" "Caption"
#   wp_set_featured_image POST_ID MEDIA_ID

# Ensure WordPress credentials are loaded
_ensure_wp_creds() {
  if [[ -z "$WP_PUPPY_USER" || -z "$WP_PUPPY_APP_PASS" ]]; then
    source ${PROJECT_DIR}/.credentials/bluehost-ftp.env
  fi
}

# Search Unsplash for photos
# Args: $1=query, $2=count (default 10)
# Output: JSON array of {id, url, description, photographer, download_url}
unsplash_search() {
  local query="${1:?Usage: unsplash_search QUERY [COUNT]}"
  local count="${2:-10}"
  local encoded_query
  encoded_query=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$query'))")

  curl -s "https://unsplash.com/napi/search/photos?query=${encoded_query}&per_page=${count}" 2>/dev/null | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    results = data.get('results', [])
    output = []
    for r in results:
        urls = r.get('urls', {})
        # Skip premium/plus photos (they return HTML on download)
        regular = urls.get('regular', '')
        if 'plus.unsplash.com' in regular:
            continue
        output.append({
            'id': r.get('id', ''),
            'page_url': f'https://unsplash.com/photos/{r.get(\"id\", \"\")}',
            'description': r.get('alt_description', 'No description'),
            'photographer': r.get('user', {}).get('name', 'Unknown'),
            'download_url': regular,
            'thumb_url': urls.get('small', ''),
            'width': r.get('width', 0),
            'height': r.get('height', 0)
        })
    print(json.dumps(output, indent=2))
except Exception as e:
    print(json.dumps({'error': str(e)}))
"
}

# Search and display results in a readable format
# Args: $1=query, $2=count (default 10)
unsplash_search_pretty() {
  local query="${1:?Usage: unsplash_search_pretty QUERY [COUNT]}"
  local count="${2:-10}"

  unsplash_search "$query" "$count" | python3 -c "
import sys, json
results = json.load(sys.stdin)
if isinstance(results, dict) and 'error' in results:
    print(f'Error: {results[\"error\"]}')
    sys.exit(1)
print(f'Found {len(results)} free photos for query:')
print()
for i, r in enumerate(results, 1):
    print(f'{i}. [{r[\"id\"]}] {r[\"description\"]}')
    print(f'   Photographer: {r[\"photographer\"]} | {r[\"width\"]}x{r[\"height\"]}')
    print(f'   Page: {r[\"page_url\"]}')
    print()
"
}

# Download a photo by ID or direct URL
# Args: $1=photo_id_or_url, $2=output_path
# Returns: 0 on success, 1 on failure
unsplash_download() {
  local source="${1:?Usage: unsplash_download PHOTO_ID_OR_URL OUTPUT_PATH}"
  local output="${2:?Usage: unsplash_download PHOTO_ID_OR_URL OUTPUT_PATH}"

  local url="$source"
  # If it looks like an ID (no slashes), look it up
  if [[ "$source" != *"/"* ]]; then
    url=$(unsplash_search "" 1 2>/dev/null | python3 -c "print('skip')" 2>/dev/null)
    # Use the napi photo endpoint instead
    url=$(curl -s "https://unsplash.com/napi/photos/${source}" 2>/dev/null | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    url = d.get('urls', {}).get('regular', '')
    if 'plus.unsplash.com' in url:
        print('PREMIUM')
    else:
        print(url)
except:
    print('ERROR')
")
    if [[ "$url" == "PREMIUM" ]]; then
      echo "ERROR: Photo $source is Unsplash+ (premium). Choose a free photo." >&2
      return 1
    fi
    if [[ "$url" == "ERROR" || -z "$url" ]]; then
      echo "ERROR: Could not find photo $source" >&2
      return 1
    fi
  fi

  # Download
  curl -sL "$url" -o "$output" 2>&1

  # Validate it's actually an image
  local filetype
  filetype=$(file -b "$output")
  if [[ "$filetype" != *"JPEG"* && "$filetype" != *"PNG"* && "$filetype" != *"image"* ]]; then
    echo "ERROR: Downloaded file is not an image ($filetype). May be premium/blocked." >&2
    rm -f "$output"
    return 1
  fi

  echo "Downloaded: $output ($(du -h "$output" | cut -f1))"
  return 0
}

# Upload image to WordPress media library
# Args: $1=file_path, $2=alt_text, $3=caption (optional)
# Output: media ID
wp_upload_image() {
  _ensure_wp_creds
  local file="${1:?Usage: wp_upload_image FILE_PATH ALT_TEXT [CAPTION]}"
  local alt_text="${2:?Usage: wp_upload_image FILE_PATH ALT_TEXT [CAPTION]}"
  local caption="${3:-}"
  local filename
  filename=$(basename "$file")

  # Upload to WordPress
  local response
  response=$(curl -s -X POST \
    -u "$WP_PUPPY_USER:$WP_PUPPY_APP_PASS" \
    "https://puppypalsutah.com/wp-json/wp/v2/media" \
    -H "Content-Disposition: attachment; filename=\"${filename}\"" \
    -H "Content-Type: $(file -b --mime-type "$file")" \
    --data-binary "@${file}")

  local media_id
  media_id=$(echo "$response" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id','ERROR'))" 2>/dev/null)

  if [[ "$media_id" == "ERROR" || -z "$media_id" ]]; then
    echo "ERROR: Upload failed. Response: $response" >&2
    return 1
  fi

  # Set alt text and caption
  curl -s -X POST \
    -u "$WP_PUPPY_USER:$WP_PUPPY_APP_PASS" \
    "https://puppypalsutah.com/wp-json/wp/v2/media/${media_id}" \
    -H "Content-Type: application/json" \
    -d "{\"alt_text\": \"${alt_text}\", \"caption\": \"${caption}\"}" > /dev/null

  echo "$media_id"
}

# Set featured image on a post
# Args: $1=post_id, $2=media_id
wp_set_featured_image() {
  _ensure_wp_creds
  local post_id="${1:?Usage: wp_set_featured_image POST_ID MEDIA_ID}"
  local media_id="${2:?Usage: wp_set_featured_image POST_ID MEDIA_ID}"

  curl -s -X POST \
    -u "$WP_PUPPY_USER:$WP_PUPPY_APP_PASS" \
    "https://puppypalsutah.com/wp-json/wp/v2/posts/${post_id}" \
    -H "Content-Type: application/json" \
    -d "{\"featured_media\": ${media_id}}" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(f'Post {d.get(\"id\")}: featured_media set to {d.get(\"featured_media\")}')
"
}

# Validate that a downloaded image matches the intended context
# This downloads the image and checks it visually — requires Claude's image reading
# Args: $1=file_path, $2=expected_context (e.g., "goldendoodle puppy with chew toy for crate training post")
# Output: PASS or FAIL with reason
# NOTE: The persona should Read the image file and judge relevance themselves.
#       This function just provides the validation prompt.
unsplash_validation_prompt() {
  local context="${1:?Usage: unsplash_validation_prompt CONTEXT}"
  cat <<EOF
IMAGE VALIDATION CHECKLIST for: ${context}

Before uploading, verify ALL of the following by reading the downloaded image:
1. SUBJECT MATCH: Does the image show what the blog post is about?
2. BREED MATCH: Is it a Goldendoodle (or close doodle/poodle mix)? Avoid obviously wrong breeds.
3. TONE MATCH: Is the image warm, positive, family-friendly? No sad/shelter vibes.
4. QUALITY: Is the image high-res, well-lit, not blurry?
5. NO TEXT/WATERMARKS: Is the image clean of overlaid text or watermarks?

If any check fails, search again with different terms. Try these search variations:
  - "goldendoodle puppy" + topic keyword
  - "doodle dog" + topic keyword
  - "puppy" + topic keyword (broader, more results)
  - "dog training" + topic keyword (for training-specific shots)

IMPORTANT: Unsplash+ (premium) photos will fail to download. If download returns HTML
or a non-image file, skip that photo and try the next result.
EOF
}

# Full pipeline: search → pick best → download → upload → set featured
# Args: $1=search_query, $2=post_id, $3=alt_text
# This is the main function the persona should call
unsplash_to_wordpress() {
  local query="${1:?Usage: unsplash_to_wordpress SEARCH_QUERY POST_ID ALT_TEXT}"
  local post_id="${2:?Usage: unsplash_to_wordpress SEARCH_QUERY POST_ID ALT_TEXT}"
  local alt_text="${3:?Usage: unsplash_to_wordpress SEARCH_QUERY POST_ID ALT_TEXT}"

  echo "Searching Unsplash for: $query"
  local results
  results=$(unsplash_search "$query" 10)

  # Extract first valid (non-premium) result
  local download_url photo_id photographer
  read -r download_url photo_id photographer < <(echo "$results" | python3 -c "
import sys, json
results = json.load(sys.stdin)
if results:
    r = results[0]
    print(f'{r[\"download_url\"]} {r[\"id\"]} {r[\"photographer\"]}')
else:
    print('NONE NONE NONE')
")

  if [[ "$download_url" == "NONE" ]]; then
    echo "ERROR: No free photos found for '$query'" >&2
    return 1
  fi

  echo "Selected: $photo_id by $photographer"

  # Download
  local tmpfile="/tmp/unsplash-${photo_id}.jpg"
  if ! unsplash_download "$download_url" "$tmpfile"; then
    return 1
  fi

  # Upload to WordPress
  echo "Uploading to WordPress..."
  local media_id
  media_id=$(wp_upload_image "$tmpfile" "$alt_text" "Photo by ${photographer} on Unsplash")

  if [[ -z "$media_id" || "$media_id" == "ERROR" ]]; then
    return 1
  fi

  echo "Media ID: $media_id"

  # Set as featured image
  wp_set_featured_image "$post_id" "$media_id"

  # Cleanup
  rm -f "$tmpfile"

  echo "Done! Photo by ${photographer} (Unsplash) set as featured image on post ${post_id}"
}
