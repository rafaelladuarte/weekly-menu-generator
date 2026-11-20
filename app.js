/* Código compartilhado entre index.html e gerador.html */

const App = (() => {
    const NO_PHOTO = 'sem-imagem.png';

    // Escapa texto antes de inserir via innerHTML
    function esc(value) {
        return String(value ?? '').replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }

    function hasPhoto(recipe) {
        return Boolean(recipe.image) && recipe.image !== NO_PHOTO;
    }

    function imgUrl(recipe) {
        return 'imagens/' + encodeURIComponent(recipe.image).replace(/'/g, '%27');
    }

    // Foto da receita; sem foto (ou se falhar ao carregar) mostra um bloco neutro.
    function photoHTML(recipe, { width, height, lazy = true } = {}) {
        const size = (width ? ` width="${width}"` : '') + (height ? ` height="${height}"` : '');
        const empty = `<div class="photo photo-empty">Sem foto</div>`;
        if (!hasPhoto(recipe)) return empty;
        return `<img class="photo" src="${imgUrl(recipe)}" alt="${esc(recipe.nome)}"${size}${lazy ? ' loading="lazy"' : ''}
                     onerror="this.outerHTML='${empty.replace(/"/g, '&quot;')}'">`;
    }

    async function loadRecipes() {
        const response = await fetch('receitas.json');
        if (!response.ok) throw new Error('Erro ao carregar receitas');
        return response.json();
    }

    function portions(recipe) {
        const n = recipe['porção'];
        return n ? `${esc(n)} ${n === 1 ? 'porção' : 'porções'}` : '';
    }

    function seasonNote(recipe) {
        if (!seasonal) return '';
        const now = foodsInSeason(recipe, new Date().getMonth());
        if (!now.length) return '';
        return `<p class="season-note">Em safra em ${MONTHS[new Date().getMonth()].toLowerCase()}: <strong>${now.map(f => esc(f.nome)).join(', ')}</strong></p>`;
    }

    // "22–25 g de proteína" por porção, quando a receita informa.
    function protein(recipe) {
        return recipe.proteina ? `${esc(recipe.proteina)} de proteína` : '';
    }

    function recipeModalHTML(recipe) {
        const ingredients = Object.entries(recipe.ingredientes || {}).map(([k, v]) =>
            `<li><span>${esc(k)}</span><span>${esc(v)}</span></li>`).join('');

        const steps = (recipe.receita || []).map(step => `<li><span>${esc(step)}</span></li>`).join('');

        const labels = [
            ...(recipe.categorias || []).map(c => `<li class="tag">${esc(c)}</li>`),
            ...(recipe.tags || []).map(t => `<li class="tag">${esc(t)}</li>`),
            recipe.verificado ? '<li class="tag tag-accent">Verificada</li>' : ''
        ].join('');

        return `
            <div class="modal fade" id="recipeModal" tabindex="-1" aria-labelledby="recipeModalTitle" aria-hidden="true">
                <div class="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">
                    <div class="modal-content">
                        <div class="modal-header border-0 pb-0">
                            <h2 class="modal-title" id="recipeModalTitle">${esc(recipe.nome)}</h2>
                            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar"></button>
                        </div>
                        <div class="modal-body p-4">
                            <div class="row g-4">
                                <div class="col-md-5">
                                    ${photoHTML(recipe, { lazy: false }).replace('class="photo', 'style="aspect-ratio:4/3;width:100%;border-radius:6px" class="photo')}
                                    <p class="recipe-meta mt-3 mb-0">${[portions(recipe), protein(recipe)].filter(Boolean).join(' · ')}</p>
                                    <ul class="tag-list">${labels}</ul>
                                    ${seasonNote(recipe)}
                                </div>
                                <div class="col-md-7">
                                    <h3 class="section-label">Ingredientes</h3>
                                    <ul class="ingredients">${ingredients}</ul>
                                </div>
                                <div class="col-12">
                                    <h3 class="section-label">Modo de preparo</h3>
                                    <ol class="steps">${steps}</ol>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>`;
    }

    function showRecipeModal(recipe) {
        const old = document.getElementById('recipeModal');
        if (old) {
            bootstrap.Modal.getInstance(old)?.dispose();
            old.remove();
        }
        document.body.insertAdjacentHTML('beforeend', recipeModalHTML(recipe));
        const el = document.getElementById('recipeModal');
        el.addEventListener('hidden.bs.modal', () => { bootstrap.Modal.getInstance(el)?.dispose(); el.remove(); });
        new bootstrap.Modal(el).show();
    }

    function shuffle(arr) {
        const a = [...arr];
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }


    // === Sazonalidade ===
    const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    const plain = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
    // Ingredientes processados ou secos não contam como "da estação".
    const IGNORE = ['molho', 'extrato', 'polpa', 'caldo', 'ketchup', 'catchup', 'em po', 'pimenta do reino', 'calabresa', 'seca', 'seco', 'passa', 'enlatad', 'conserva'];

    let seasonal = null;
    let foodIndex = [];
    const matchCache = new Map();

    async function loadSeasonal() {
        const response = await fetch('sazonalidade.json');
        if (!response.ok) throw new Error('Erro ao carregar sazonalidade');
        seasonal = await response.json();
        foodIndex = seasonal.alimentos
            .map(f => ({ food: f, key: plain(f.nome) }))
            .sort((a, b) => b.key.length - a.key.length); // nome mais longo primeiro: "batata doce" antes de "batata"
        matchCache.clear();
        return seasonal;
    }

    function foodForIngredient(ingredient) {
        const p = ' ' + plain(ingredient) + ' ';
        if (IGNORE.some(w => p.includes(w))) return null;
        const hit = foodIndex.find(({ key }) => p.includes(' ' + key + ' ') || p.includes(' ' + key + 's '));
        return hit ? hit.food : null;
    }

    // Alimentos da tabela usados pela receita (sem repetir).
    function recipeFoods(recipe) {
        if (!matchCache.has(recipe.nome)) {
            const found = new Map();
            Object.keys(recipe.ingredientes || {}).forEach(ing => {
                const f = foodForIngredient(ing);
                if (f) found.set(f.nome, f);
            });
            matchCache.set(recipe.nome, [...found.values()]);
        }
        return matchCache.get(recipe.nome);
    }

    // Alimentos da receita (sem alho, cebola e temperos) com oferta de nível 2 (alta) ou ao menos 1 (média) no mês (0 = janeiro).
    function foodsInSeason(recipe, month, minLevel = 2) {
        return recipeFoods(recipe).filter(f => !f.base && f.meses[month] >= minLevel);
    }

    return { protein, MONTHS, loadSeasonal, recipeFoods, foodsInSeason, getSeasonal: () => seasonal, esc, photoHTML, loadRecipes, portions, showRecipeModal, shuffle };
})();
