import unittest
from unittest.mock import patch
from datetime import datetime, timezone
import collect_markets as m

class Tests(unittest.TestCase):
    def test_feed(self):
        xml=b'<rss><channel><item><title>Bitcoin - News</title><source>News</source><link>https://example.com/news</link><pubDate>Sat, 10 Oct 2026 12:00:00 GMT</pubDate></item><item><title>bad</title><link>javascript:alert(1)</link></item></channel></rss>'
        news=m.parse_feed(xml,'crypto')
        self.assertEqual(len(news),1)
        self.assertEqual(news[0]['title'],'Bitcoin')
        self.assertEqual(news[0]['category'],'BTC')
    def test_dedup(self):
        item=dict(title='Sample',published_at=datetime.now(timezone.utc).isoformat(),link='https://example.com')
        self.assertEqual(len(m.merge_news([item,item],[item])),1)
    def test_failures_retain_previous(self):
        previous={'markets':{'kr':{'news':[{'title':'old'}],'news_updated_at':'2026-10-01','quotes':[{'symbol':'^KS11','name':'코스피','price':123}]}}}
        with patch.object(m,'get',side_effect=TimeoutError):
            result=m.collect(previous)
        self.assertEqual(result['markets']['kr']['news_updated_at'],'2026-10-01')
        self.assertEqual(result['markets']['kr']['quotes'][0]['price'],123)
        self.assertTrue(result['markets']['kr']['quotes'][0]['stale'])
        self.assertTrue(result['markets']['crypto']['errors'])
    def test_previous_close_not_range_start(self):
        data={'chart':{'result':[{'meta':{'regularMarketPrice':110,'regularMarketTime':172800,'chartPreviousClose':80,'currency':'KRW'},'timestamp':[0,86400,172800],'indicators':{'quote':[{'close':[80,100,110]}]}}]}}
        with patch.object(m,'get',return_value=data):
            q=m.yahoo_quote('^KS11','코스피')
        self.assertAlmostEqual(q['change_pct'],10)

if __name__=='__main__': unittest.main()
