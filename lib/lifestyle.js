'use strict';
// Onglets « vie quotidienne » : recettes, coach hygiène de vie (habitudes + conseils).

const RECIPES = [
  { id: 'ratatouille', title: 'Ratatouille provençale', time: 60, level: 'facile', season: ['été', 'automne'], tags: ['végétarien'],
    ingredients: ['2 courgettes', '1 aubergine', '2 poivrons', '4 tomates', '1 oignon', '2 gousses d’ail', 'huile d’olive', 'thym, laurier'],
    steps: ['Coupez tous les légumes en dés.', 'Faites revenir l’oignon et l’ail dans l’huile d’olive.', 'Ajoutez poivrons, aubergine puis courgettes, 5 minutes chacun.', 'Ajoutez les tomates, le thym et le laurier, salez, poivrez.', 'Laissez mijoter 40 minutes à couvert.'] },
  { id: 'veloute-potiron', title: 'Velouté de potiron', time: 35, level: 'facile', season: ['automne', 'hiver'], tags: ['végétarien'],
    ingredients: ['800 g de potiron', '1 pomme de terre', '1 oignon', '75 cl de bouillon de légumes', '10 cl de crème', 'muscade'],
    steps: ['Épluchez et coupez le potiron et la pomme de terre en cubes.', 'Faites suer l’oignon émincé.', 'Ajoutez les légumes et le bouillon, cuisez 25 minutes.', 'Mixez avec la crème, ajoutez une pincée de muscade.'] },
  { id: 'poulet-basquaise', title: 'Poulet basquaise', time: 55, level: 'facile', season: ['été', 'automne'], tags: ['viande'],
    ingredients: ['4 cuisses de poulet', '3 poivrons', '4 tomates', '1 oignon', '2 gousses d’ail', 'piment d’Espelette', 'huile d’olive'],
    steps: ['Faites dorer le poulet dans l’huile d’olive, réservez.', 'Faites revenir oignon, ail et poivrons en lanières.', 'Ajoutez les tomates et le piment, remettez le poulet.', 'Couvrez et laissez mijoter 35 minutes.'] },
  { id: 'quiche-lorraine', title: 'Quiche lorraine', time: 50, level: 'facile', season: ['toutes'], tags: ['viande'],
    ingredients: ['1 pâte brisée', '200 g de lardons', '3 œufs', '20 cl de crème', '20 cl de lait', 'muscade'],
    steps: ['Préchauffez le four à 180 degrés.', 'Faites revenir les lardons à sec.', 'Battez œufs, crème et lait, salez peu, poivrez, muscade.', 'Garnissez la pâte de lardons, versez l’appareil.', 'Enfournez 35 minutes.'] },
  { id: 'saumon-papillote', title: 'Saumon en papillote, citron et aneth', time: 25, level: 'facile', season: ['toutes'], tags: ['poisson', 'léger'],
    ingredients: ['4 pavés de saumon', '1 citron', 'aneth', '2 courgettes', 'huile d’olive'],
    steps: ['Préchauffez le four à 200 degrés.', 'Posez chaque pavé sur des rondelles de courgette dans du papier cuisson.', 'Ajoutez citron, aneth, un filet d’huile, sel et poivre.', 'Fermez les papillotes et enfournez 15 minutes.'] },
  { id: 'risotto-champignons', title: 'Risotto aux champignons', time: 40, level: 'moyen', season: ['automne', 'hiver'], tags: ['végétarien'],
    ingredients: ['300 g de riz arborio', '300 g de champignons', '1 échalote', '1 litre de bouillon', '10 cl de vin blanc', '50 g de parmesan', 'beurre'],
    steps: ['Faites revenir l’échalote et les champignons au beurre.', 'Ajoutez le riz, nacrez-le 2 minutes, déglacez au vin blanc.', 'Versez le bouillon chaud louche par louche en remuant, 18 minutes.', 'Hors du feu, ajoutez parmesan et une noix de beurre.'] },
  { id: 'salade-nicoise', title: 'Salade niçoise', time: 20, level: 'facile', season: ['printemps', 'été'], tags: ['poisson', 'léger'],
    ingredients: ['4 tomates', '2 œufs durs', '1 boîte de thon', 'olives noires', 'haricots verts', '1 poivron', 'anchois', 'huile d’olive'],
    steps: ['Faites cuire les œufs 10 minutes et les haricots verts 8 minutes.', 'Coupez tomates et poivron.', 'Disposez tous les ingrédients, ajoutez thon, olives et anchois.', 'Assaisonnez d’huile d’olive, sel et poivre.'] },
  { id: 'boeuf-bourguignon', title: 'Bœuf bourguignon', time: 180, level: 'moyen', season: ['automne', 'hiver'], tags: ['viande'],
    ingredients: ['1,2 kg de bœuf à braiser', '75 cl de vin rouge', '200 g de lardons', '250 g de champignons', '3 carottes', '2 oignons', 'bouquet garni', 'farine'],
    steps: ['Faites dorer la viande en morceaux, saupoudrez de farine.', 'Ajoutez oignons, carottes, lardons, puis le vin et le bouquet garni.', 'Laissez mijoter 2 heures 30 à feu doux.', 'Ajoutez les champignons 30 minutes avant la fin.'] },
  { id: 'gratin-dauphinois', title: 'Gratin dauphinois', time: 75, level: 'facile', season: ['automne', 'hiver'], tags: ['végétarien'],
    ingredients: ['1 kg de pommes de terre', '50 cl de lait', '25 cl de crème', '1 gousse d’ail', 'muscade', 'beurre'],
    steps: ['Préchauffez le four à 160 degrés, frottez le plat à l’ail et beurrez-le.', 'Coupez les pommes de terre en fines rondelles.', 'Portez lait, crème, sel, poivre et muscade à frémissement avec les pommes de terre, 10 minutes.', 'Versez dans le plat et enfournez 1 heure.'] },
  { id: 'curry-lentilles', title: 'Curry de lentilles corail', time: 30, level: 'facile', season: ['toutes'], tags: ['végétarien', 'léger'],
    ingredients: ['250 g de lentilles corail', '40 cl de lait de coco', '1 boîte de tomates', '1 oignon', 'curry', 'gingembre', 'coriandre'],
    steps: ['Faites revenir l’oignon avec le curry et le gingembre.', 'Ajoutez lentilles, tomates, lait de coco et 30 cl d’eau.', 'Cuisez 20 minutes en remuant.', 'Servez avec de la coriandre et du riz.'] },
  { id: 'soupe-oignon', title: 'Soupe à l’oignon gratinée', time: 60, level: 'facile', season: ['hiver'], tags: ['végétarien'],
    ingredients: ['6 oignons', '1,5 litre de bouillon', '10 cl de vin blanc', 'pain', 'gruyère râpé', 'beurre', 'farine'],
    steps: ['Faites fondre les oignons émincés au beurre 20 minutes.', 'Saupoudrez d’une cuillère de farine, ajoutez vin et bouillon, cuisez 20 minutes.', 'Versez dans des bols, ajoutez pain et gruyère.', 'Gratinez 5 minutes sous le gril.'] },
  { id: 'tarte-pommes', title: 'Tarte fine aux pommes', time: 40, level: 'facile', season: ['automne', 'hiver'], tags: ['dessert'],
    ingredients: ['1 pâte feuilletée', '4 pommes', '30 g de beurre', '2 cuillères de sucre', 'cannelle'],
    steps: ['Préchauffez le four à 200 degrés.', 'Épluchez et coupez les pommes en fines lamelles.', 'Disposez-les en rosace sur la pâte, parsemez de beurre, sucre et cannelle.', 'Enfournez 25 minutes.'] },
  { id: 'pates-carbonara', title: 'Pâtes à la carbonara', time: 20, level: 'facile', season: ['toutes'], tags: ['viande', 'rapide'],
    ingredients: ['400 g de spaghetti', '150 g de pancetta ou lardons', '3 jaunes d’œufs', '60 g de parmesan', 'poivre'],
    steps: ['Faites cuire les pâtes.', 'Faites dorer la pancetta.', 'Mélangez jaunes d’œufs, parmesan et beaucoup de poivre.', 'Hors du feu, mélangez pâtes, pancetta et sauce avec un peu d’eau de cuisson.'] },
  { id: 'omelette-herbes', title: 'Omelette aux fines herbes', time: 10, level: 'facile', season: ['toutes'], tags: ['végétarien', 'rapide', 'léger'],
    ingredients: ['3 œufs', 'ciboulette, persil, cerfeuil', 'beurre'],
    steps: ['Battez les œufs avec les herbes ciselées, salez, poivrez.', 'Faites mousser le beurre dans une poêle.', 'Versez les œufs, ramenez les bords vers le centre.', 'Pliez l’omelette encore baveuse.'] },
  { id: 'cabillaud-poireaux', title: 'Cabillaud à la fondue de poireaux', time: 35, level: 'facile', season: ['automne', 'hiver', 'printemps'], tags: ['poisson', 'léger'],
    ingredients: ['4 dos de cabillaud', '3 poireaux', '15 cl de crème', 'beurre', 'citron'],
    steps: ['Émincez les poireaux et faites-les fondre au beurre 20 minutes.', 'Ajoutez la crème, salez, poivrez.', 'Faites cuire le cabillaud à la poêle 4 minutes par face.', 'Servez sur la fondue avec un filet de citron.'] },
  { id: 'taboule', title: 'Taboulé frais', time: 20, level: 'facile', season: ['printemps', 'été'], tags: ['végétarien', 'léger'],
    ingredients: ['250 g de semoule', '3 tomates', '1 concombre', '1 oignon rouge', 'menthe et persil', '2 citrons', 'huile d’olive'],
    steps: ['Versez de l’eau bouillante salée sur la semoule, couvrez 5 minutes.', 'Coupez tomates, concombre et oignon en petits dés.', 'Mélangez avec les herbes ciselées, le jus de citron et l’huile.', 'Réservez au frais 1 heure.'] },
];

const HABITS = [
  { id: 'eau', label: 'Boire 8 verres d’eau', target: 8, unit: 'verres' },
  { id: 'marche', label: '30 minutes de marche ou de sport', target: 1 },
  { id: 'legumes', label: '5 fruits et légumes', target: 5, unit: 'portions' },
  { id: 'respiration', label: '5 minutes de respiration ou de méditation', target: 1 },
  { id: 'ecran', label: 'Pas d’écran une heure avant le coucher', target: 1 },
  { id: 'sommeil', label: 'Au lit avant 23 heures', target: 1 },
];

const TIPS = [
  'Buvez un grand verre d’eau dès le réveil : après la nuit, le corps est légèrement déshydraté.',
  'Exposez-vous à la lumière du jour le matin, même dix minutes : cela cale votre horloge interne et facilite l’endormissement le soir.',
  'Levez-vous et marchez deux minutes toutes les heures si vous travaillez assis.',
  'Remplissez la moitié de votre assiette de légumes : c’est la façon la plus simple d’atteindre vos cinq portions.',
  'Essayez la respiration quatre-sept-huit : inspirez quatre secondes, retenez sept, expirez huit. Trois cycles suffisent à calmer le stress.',
  'Gardez des horaires de coucher réguliers, même le week-end : la régularité compte autant que la durée du sommeil.',
  'Évitez la caféine après quatorze heures : elle reste active plusieurs heures dans l’organisme.',
  'Prenez l’escalier plutôt que l’ascenseur : c’est du sport gratuit, intégré à votre journée.',
  'Mangez lentement : il faut environ vingt minutes pour que la sensation de satiété arrive.',
  'Coupez les notifications une heure avant de dormir et posez le téléphone hors de la chambre.',
  'Une marche de trente minutes par jour réduit nettement le risque de maladies cardiovasculaires.',
  'Préparez une collation saine à l’avance, des noix ou un fruit, pour éviter le grignotage sucré de l’après-midi.',
  'Faites des étirements doux le soir : dix minutes suffisent pour relâcher les tensions de la journée.',
  'Gardez une bouteille d’eau sur votre bureau : on boit davantage quand l’eau est sous les yeux.',
  'Gardez la chambre fraîche, autour de dix-huit degrés, pour un sommeil de meilleure qualité.',
  'Limitez les plats ultra-transformés : plus la liste d’ingrédients est courte, mieux c’est.',
  'Pratiquez la règle des vingt-vingt-vingt devant un écran : toutes les vingt minutes, regardez à six mètres pendant vingt secondes.',
  'Une courte sieste de vingt minutes en début d’après-midi améliore la vigilance sans perturber la nuit.',
  'Notez trois choses positives de votre journée chaque soir : c’est un petit rituel efficace contre le stress.',
  'Ne sautez pas le petit-déjeuner si vous avez faim le matin, mais privilégiez protéines et fibres plutôt que le sucre.',
];

function dayIndex(d = new Date()) { return Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 864e5); }

function season(d = new Date()) {
  const m = d.getMonth();
  return m <= 1 || m === 11 ? 'hiver' : m <= 4 ? 'printemps' : m <= 7 ? 'été' : 'automne';
}

function seasonalRecipes(d = new Date()) {
  const s = season(d);
  return RECIPES.filter((r) => r.season.includes(s) || r.season.includes('toutes'));
}

function recipeOfDay(d = new Date()) {
  const list = seasonalRecipes(d);
  return list[dayIndex(d) % list.length];
}

function tipOfDay(d = new Date()) { return TIPS[dayIndex(d) % TIPS.length]; }

function strip(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, ' '); }

// Recherche d'une recette par ingrédient ou par nom.
function findRecipes(query) {
  const words = strip(query).split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !['avec', 'des', 'les', 'une', 'recette', 'pour', 'ce', 'soir', 'midi', 'idee', 'plat', 'faire'].includes(w));
  if (!words.length) return [];
  return RECIPES.map((r) => {
    const hay = strip([r.title, ...r.ingredients, ...r.tags].join(' '));
    const score = words.reduce((s, w) => s + (hay.includes(w) ? 2 : hay.includes(w.slice(0, Math.max(4, w.length - 2))) ? 1 : 0), 0);
    return { r, score };
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score).map((x) => x.r);
}

function recipeSpeech(r, full) {
  const base = `${r.title}, prêt en ${r.time} minutes, niveau ${r.level}. Il vous faut : ${r.ingredients.join(', ')}.`;
  return full ? `${base} ${r.steps.map((s, i) => `Étape ${i + 1} : ${s}`).join(' ')}` : base;
}

module.exports = { RECIPES, HABITS, TIPS, season, seasonalRecipes, recipeOfDay, tipOfDay, findRecipes, recipeSpeech, dayIndex };
