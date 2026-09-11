// Maximum characters for dataset output
export const MAX_RESULT_CHARS = 50_000;

// Untrusted content markers
export const EXTERNAL_CONTENT_START = "<<<EXTERNAL_UNTRUSTED_CONTENT>>>";
export const EXTERNAL_CONTENT_END = "<<<END_EXTERNAL_UNTRUSTED_CONTENT>>>";

// Known actors catalog for the tool description
export const KNOWN_ACTORS = `
INSTAGRAM: apify~instagram-profile-scraper, apify~instagram-post-scraper, apify~instagram-comment-scraper, apify~instagram-hashtag-scraper, apify~instagram-hashtag-stats, apify~instagram-reel-scraper, apify~instagram-search-scraper, apify~instagram-tagged-scraper, apify~instagram-followers-count-scraper, apify~instagram-scraper, apify~instagram-api-scraper, apify~export-instagram-comments-posts

FACEBOOK: apify~facebook-pages-scraper, apify~facebook-page-contact-information, apify~facebook-posts-scraper, apify~facebook-comments-scraper, apify~facebook-likes-scraper, apify~facebook-reviews-scraper, apify~facebook-groups-scraper, apify~facebook-events-scraper, apify~facebook-ads-scraper, apify~facebook-search-scraper, apify~facebook-reels-scraper, apify~facebook-photos-scraper, apify~facebook-marketplace-scraper, apify~facebook-followers-following-scraper

TIKTOK: clockworks~tiktok-scraper, clockworks~free-tiktok-scraper, clockworks~tiktok-profile-scraper, clockworks~tiktok-video-scraper, clockworks~tiktok-comments-scraper, clockworks~tiktok-followers-scraper, clockworks~tiktok-user-search-scraper, clockworks~tiktok-hashtag-scraper, clockworks~tiktok-sound-scraper, clockworks~tiktok-ads-scraper, clockworks~tiktok-discover-scraper, clockworks~tiktok-explore-scraper, clockworks~tiktok-trends-scraper, clockworks~tiktok-live-scraper

YOUTUBE: streamers~youtube-scraper, streamers~youtube-channel-scraper, streamers~youtube-comments-scraper, streamers~youtube-shorts-scraper, streamers~youtube-video-scraper-by-hashtag, apidojo~youtube-playlist-scraper

TWITTER/X: apidojo~tweet-scraper, apidojo~twitter-scraper-lite, apidojo~twitter-user-scraper, apidojo~twitter-list-scraper

GOOGLE MAPS: compass~crawler-google-places, compass~google-maps-extractor, compass~Google-Maps-Reviews-Scraper, poidata~google-maps-email-extractor

OTHER: apify~google-search-scraper, apify~google-trends-scraper, voyager~booking-scraper, voyager~booking-reviews-scraper, maxcopell~tripadvisor-reviews, vdrmota~contact-info-scraper, apify~e-commerce-scraping-tool
`.trim();