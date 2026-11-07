// Small client-side pager shared by public catalogs and Studio lists.
export function createPagination(container, { pageSize = 12, label = 'items' } = {}) {
  let items = [];
  let page = 1;
  let renderItem = () => '';

  const render = () => {
    const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
    page = Math.min(page, pageCount);
    const start = (page - 1) * pageSize;
    const visible = items.slice(start, start + pageSize);
    container.innerHTML = `${visible.map(renderItem).join('')}${items.length > pageSize ? `<nav class="pagination" aria-label="${label} pages"><span>Showing ${start + 1}–${Math.min(start + pageSize, items.length)} of ${items.length}</span><div><button type="button" data-page="${page - 1}" ${page === 1 ? 'disabled' : ''} aria-label="Previous page">← Previous</button><span>Page ${page} of ${pageCount}</span><button type="button" data-page="${page + 1}" ${page === pageCount ? 'disabled' : ''} aria-label="Next page">Next →</button></div></nav>` : ''}`;
    container.querySelectorAll('[data-page]').forEach((button) => {
      button.addEventListener('click', () => {
        page = Number(button.dataset.page);
        render();
        container.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  };

  return {
    setItems(nextItems, itemRenderer = renderItem) {
      items = nextItems;
      renderItem = itemRenderer;
      page = 1;
      render();
    },
  };
}
