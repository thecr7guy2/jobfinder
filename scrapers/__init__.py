from scrapers.greenhouse import GreenhouseScraper
from scrapers.html import HTMLScraper
from scrapers.icims import ICIMSScraper

SCRAPER_TYPES = {
    "greenhouse": GreenhouseScraper,
    "html": HTMLScraper,
    "icims": ICIMSScraper,
}
