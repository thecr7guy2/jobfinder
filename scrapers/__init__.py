from scrapers.html import HTMLScraper
from scrapers.icims import ICIMSScraper

SCRAPER_TYPES = {
    "html": HTMLScraper,
    "icims": ICIMSScraper,
}

