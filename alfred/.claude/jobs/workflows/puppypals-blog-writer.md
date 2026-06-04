# PuppyPals Blog Writer

Write and publish blog posts for puppypalsutah.com. Two post types per week.

## Determine Post Type

Check which job triggered this run:
- **`puppypals-blog-writer`** = Monday post (affiliate, 800-1200 words)
- **`puppypals-friday-post`** = Friday post (no affiliates, 300-600 words)

Pick the next `pending` topic from the matching queue in the content calendar.

## Instructions

1. Source credentials and image library:
   ```bash
   source .credentials/bluehost-ftp.env
   source .claude/jobs/lib/unsplash-images.sh
   ```
2. Read the voice guide: `.claude/context/voice-of-puppypals.md`
3. Read the knowledge base: `.claude/jobs/personas/content-writer/knowledge.md`
4. Read the content calendar: `.claude/jobs/workflows/puppypals-content-calendar.md`
5. Find the next `pending` topic from the correct queue (Monday or Friday)
6. Research the topic using web search
7. **Monday posts only**: search Amazon for real products, get ASINs, build affiliate links using `$AMAZON_ASSOCIATES_TAG`. Check the link registry first (`.claude/data/affiliate-link-registry.yaml`) to reuse existing ASINs.
8. Write the post in the Puppy Pals voice, respecting length rules:
   - Monday: 800-1200 words, max 3 affiliate links (different categories)
   - Friday: 300-600 words, zero affiliate links, casual and personal
9. **Monday posts**: Find a featured image (see Image Sourcing below). Friday posts: image optional.
10. Publish via WordPress REST API:
    - Monday posts: `date` set to Monday 8:00 AM MST (14:00 UTC)
    - Friday posts: `date` set to Friday 8:00 AM MST (14:00 UTC)
11. Upload and set the featured image on the post
12. Update the content calendar (mark topic as `published`, add URL and date)
13. Save a JSON report to `.claude/agent-output/results/puppypals/`
14. Send Telegram notification to Sir with the post title and link

## Category Mapping

Use these WordPress category IDs when creating posts. Look up current categories first:
```bash
curl -s -u "$WP_PUPPY_USER:$WP_PUPPY_APP_PASS" "https://puppypalsutah.com/wp-json/wp/v2/categories?per_page=50&_fields=id,name"
```

If a matching category doesn't exist, create one:
```bash
curl -s -X POST -u "$WP_PUPPY_USER:$WP_PUPPY_APP_PASS" \
  "https://puppypalsutah.com/wp-json/wp/v2/categories" \
  -H "Content-Type: application/json" \
  -d '{"name": "Puppy Care Tips"}'
```

## Affiliate Link Format

```html
<a href="https://www.amazon.com/dp/{ASIN}?tag=puppypals06-20" target="_blank" rel="nofollow noopener sponsored">{Product Name}</a>
```

Always include `rel="nofollow noopener sponsored"` — required by Amazon Associates and Google.

## Image Sourcing

Every post needs a featured image. Use the shared Unsplash library:

```bash
source .claude/jobs/lib/unsplash-images.sh
```

### Search Strategy
Try searches in this order until you find a good match:
1. `"goldendoodle puppy [topic keyword]"` — most specific
2. `"goldendoodle [topic keyword]"` — broader breed match
3. `"doodle dog [topic keyword]"` — catches labradoodles etc
4. `"puppy [topic keyword]"` — broadest, most results

### Validation Checklist
Before uploading, **Read the downloaded image** and verify:
- **Subject match**: Does the image relate to the blog post topic?
- **Breed match**: Is it a Goldendoodle or similar doodle/poodle mix? (doesn't need to be exact, but no chihuahuas for a Goldendoodle post)
- **Tone match**: Warm, positive, family-friendly — no sad shelter photos
- **Quality**: High-res, well-lit, not blurry or cropped badly
- **Clean**: No watermarks, text overlays, or logos

### Upload Pipeline
```bash
# Option A: Full automated pipeline
unsplash_to_wordpress "goldendoodle puppy crate training" POST_ID "Goldendoodle puppy learning to love their crate"

# Option B: Manual steps for more control
unsplash_search_pretty "goldendoodle puppy crate"           # Browse results
unsplash_download "PHOTO_ID" "/tmp/post-image.jpg"          # Download best match
# Read /tmp/post-image.jpg to validate visually
media_id=$(wp_upload_image "/tmp/post-image.jpg" "Alt text" "Photo by Photographer on Unsplash")
wp_set_featured_image POST_ID "$media_id"
```

### Attribution
Unsplash license doesn't require attribution, but we include it as a caption anyway (good practice):
- Caption format: `"Photo by [Photographer] on Unsplash"`

### If No Good Image Found
- Skip the featured image rather than use a bad match
- Note it in the JSON report: `"featured_image": "skipped — no good match found"`
- Sir can add one manually later

## Quality Checks Before Publishing

- [ ] Title is engaging and includes a keyword naturally
- [ ] Content is 600-1500 words
- [ ] Written in Puppy Pals voice (warm, family, conversational)
- [ ] No duplicate of existing posts
- [ ] Affiliate links use real ASINs (verified via web search)
- [ ] All affiliate links include the Associates tag
- [ ] Featured image uploaded and validated (or noted as skipped)
- [ ] Post scheduled for Monday 8:00 AM MST
