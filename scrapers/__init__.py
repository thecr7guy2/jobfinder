from scrapers.albert_heijn import AlbertHeijnScraper
from scrapers.abn_amro import ABNAMROScraper
from scrapers.greenhouse import GreenhouseScraper
from scrapers.html import HTMLScraper
from scrapers.ing import INGScraper
from scrapers.icims import ICIMSScraper
from scrapers.just_eat_takeaway import JustEatTakeawayScraper

SCRAPER_TYPES = {
    "albert_heijn": AlbertHeijnScraper,
    "abn_amro": ABNAMROScraper,
    "greenhouse": GreenhouseScraper,
    "html": HTMLScraper,
    "ing": INGScraper,
    "icims": ICIMSScraper,
    "just_eat_takeaway": JustEatTakeawayScraper,
}
