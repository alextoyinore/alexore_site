import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles.css';

import chrome from './pages/chrome.html?raw';
import home from './pages/index.html?raw';
import writing from './pages/writing.html?raw';
import about from './pages/about.html?raw';
import article from './pages/article.html?raw';
import book from './pages/book.html?raw';
import browse from './pages/browse.html?raw';
import contentItem from './pages/content-item.html?raw';
import framework from './pages/framework.html?raw';
import media from './pages/media.html?raw';
import products from './pages/products.html?raw';
import search from './pages/search.html?raw';
import speaking from './pages/speaking.html?raw';
import studio from './pages/studio.html?raw';
import teaching from './pages/teaching.html?raw';

const pages = { 'index.html': home, 'writing.html': writing, 'about.html': about,
  'article.html': article, 'book.html': book, 'browse.html': browse,
  'content-item.html': contentItem, 'framework.html': framework, 'media.html': media,
  'products.html': products, 'search.html': search, 'speaking.html': speaking,
  'studio.html': studio, 'teaching.html': teaching };
const legacyModules = import.meta.glob([
  '../app.js', '../article.js', '../browse.js', '../catalog.js', '../content-item.js',
  '../content.js', '../detail.js', '../header-search.js', '../search.js',
  '../studio.js', '../writing-list.js',
]);
const voidElements = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const pageScripts = {
  'index.html': ['app.js', 'header-search.js'],
  'writing.html': ['content.js', 'writing-list.js', 'detail.js', 'header-search.js'],
  'about.html': ['detail.js', 'header-search.js'],
  'article.html': ['content.js', 'detail.js', 'article.js', 'header-search.js'],
  'book.html': ['detail.js', 'header-search.js'],
  'browse.html': ['browse.js', 'detail.js', 'header-search.js'],
  'content-item.html': ['content-item.js', 'detail.js', 'header-search.js'],
  'framework.html': ['detail.js', 'header-search.js'],
  'media.html': ['detail.js', 'catalog.js', 'header-search.js'],
  'products.html': ['detail.js', 'catalog.js', 'header-search.js'],
  'search.html': ['search.js', 'detail.js', 'header-search.js'],
  'speaking.html': ['detail.js', 'header-search.js'],
  'studio.html': ['studio.js'],
  'teaching.html': ['detail.js', 'header-search.js'],
};

function nodeProps(element) {
  const props = {};
  for (const attribute of element.attributes) {
    const name = attribute.name === 'class' ? 'className' : attribute.name === 'for' ? 'htmlFor' : attribute.name;
    props[name] = attribute.value;
  }
  if (!voidElements.has(element.tagName.toLowerCase())) {
    props.dangerouslySetInnerHTML = { __html: element.innerHTML };
  }
  return props;
}

function RawElement({ element }) {
  return React.createElement(element.tagName.toLowerCase(), nodeProps(element));
}

function StudioLogin({ element }) {
  return element ? <RawElement element={element} /> : null;
}

function StudioSidebar({ element }) {
  return element ? <RawElement element={element} /> : null;
}

function StudioWorkspace({ element }) {
  return element ? <RawElement element={element} /> : null;
}

function StudioOverlays({ elements }) {
  return elements.map((element) => <RawElement key={element.id} element={element} />);
}

function StudioPage({ parts }) {
  return <>
    <StudioLogin element={parts.login} />
    <StudioSidebar element={parts.sidebar} />
    <StudioWorkspace element={parts.main} />
    <StudioOverlays elements={parts.extras} />
  </>;
}

function ReactSite() {
  const filename = location.pathname.split('/').filter(Boolean).pop() || 'index.html';
  const source = pages[filename] || home;
  const chromeDoc = useMemo(() => new DOMParser().parseFromString(chrome, 'text/html'), []);
  const [parts] = useState(() => {
    const doc = new DOMParser().parseFromString(source, 'text/html');
    return { main: doc.querySelector('main'), login: doc.querySelector('#loginScreen'), sidebar: doc.querySelector('.sidebar'),
      extras: [...doc.querySelectorAll('#editorPage, #articleImageFile, #toast')],
      title: doc.title };
  });
  const scriptNames = pageScripts[filename] || pageScripts['index.html'];

  useEffect(() => {
    document.title = parts.title || 'alexore — Notes on work, money & becoming';
    document.body.classList.toggle('studio-body', filename === 'studio.html');
    (async () => {
      for (const name of scriptNames) {
        const path = `../${name}`;
        const loadModule = legacyModules[path];
        if (!loadModule) throw new Error(`Missing page behavior module: ${path}`);
        await loadModule();
      }
    })().catch(error => console.error('Could not initialize this page:', error));
  }, [filename, parts, scriptNames]);

  if (filename === 'studio.html') return <StudioPage parts={parts} />;

  return <><RawElement element={chromeDoc.querySelector('header')} />
    {parts.main && <RawElement element={parts.main} />}
    <RawElement element={chromeDoc.querySelector('footer')} /></>;
}

createRoot(document.getElementById('root')).render(<ReactSite />);
