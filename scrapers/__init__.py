from scrapers.abn_amro import ABNAMROScraper
from scrapers.greenhouse import GreenhouseScraper
from scrapers.html import HTMLScraper
from scrapers.icims import ICIMSScraper

SCRAPER_TYPES = {
    "abn_amro": ABNAMROScraper,
    "greenhouse": GreenhouseScraper,
    "html": HTMLScraper,
    "icims": ICIMSScraper,
}
