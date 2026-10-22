"""Preserve the displayed text/chart sequence when exporting a saved answer."""
import html
from html.parser import HTMLParser
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit, unquote


def share_markup(markup, urls, theme, base_path=''):
    def local_path(path):
        if base_path and path.startswith(base_path+'/'):path=path[len(base_path):]
        return path.replace('/share-artifact/','/generated/',1)
    trusted={local_path(urlsplit(str(url)).path) for url in urls}
    class Parser(HTMLParser):
        def __init__(self):
            super().__init__(convert_charrefs=False)
            self.output=[];self.index=0;self.skip_tag=None;self.depth=0

        def frame(self,url,title='Analysis chart'):
            parts=urlsplit(str(url or ''))
            if '..' in unquote(parts.path).split('/'):
                return ''
            path=parts.path
            if base_path and path.startswith(base_path+'/'):path=path[len(base_path):]
            # Browser-captured frames use absolute public URLs. Resolve only
            # known saved artifacts locally; never fetch an arbitrary origin.
            if (parts.scheme or parts.netloc) and (parts.scheme not in ('http','https') or local_path(path) not in trusted):return ''
            if not path.startswith(('/generated/','/share-artifact/','/static/cases/')) or not path.endswith('.html'):
                return ''
            if path.startswith('/generated/'):path=path.replace('/generated/','/share-artifact/',1)
            query=dict(parse_qsl(parts.query,keep_blank_values=True))
            if path.startswith('/share-artifact/'):query['theme']=theme
            src=urlunsplit(('', '', path, urlencode(query), parts.fragment))
            return f'<iframe class="reportDocumentFrame" src="{html.escape(src,quote=True)}" title="{html.escape(title,quote=True)}" scrolling="no"></iframe>'

        def handle_starttag(self,tag,attrs):
            if self.skip_tag:
                if tag==self.skip_tag:self.depth+=1
                return
            data=dict(attrs);classes=set((data.get('class') or '').split())
            if classes & {'streamvizArtifactHost','visualize-widget-block'}:
                url=data.get('data-artifact-url') or (urls[self.index] if self.index<len(urls) else '')
                self.index+=1;self.output.append(self.frame(url))
                self.skip_tag=tag;self.depth=1;return
            if tag=='iframe' and 'visualize-widget-frame' in classes:
                self.skip_tag=tag;self.depth=1;return
            if tag=='iframe' and 'reportDocumentFrame' in classes:
                self.index+=1
                self.output.append(self.frame(data.get('src'),data.get('title') or 'Analysis chart'))
                self.skip_tag=tag;self.depth=1;return
            self.output.append(self.get_starttag_text())

        def handle_startendtag(self,tag,attrs):
            if self.skip_tag:return
            if tag=='iframe' or set((dict(attrs).get('class') or '').split()) & {'streamvizArtifactHost','visualize-widget-block'}:
                self.handle_starttag(tag,attrs);self.skip_tag=None;self.depth=0
            else:self.output.append(self.get_starttag_text())

        def handle_endtag(self,tag):
            if self.skip_tag:
                if tag==self.skip_tag:
                    self.depth-=1
                    if self.depth==0:self.skip_tag=None
                return
            self.output.append(f'</{tag}>')

        def handle_data(self,data):
            if not self.skip_tag:self.output.append(data)

        def handle_entityref(self,name):
            if not self.skip_tag:self.output.append('&'+name+';')

        def handle_charref(self,name):
            if not self.skip_tag:self.output.append('&#'+name+';')

        def handle_comment(self,data):
            if not self.skip_tag:self.output.append('<!--'+data+'-->')

    parser=Parser();parser.feed(markup);parser.close()
    return ''.join(parser.output)
