async function getData(url) {
    // https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch
    const response = await fetch(url, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
        },
        redirect: 'follow',
    });
    return response.json();
}

async function loadCountriesData() {
    const countries = await getData('https://restcountries.com/v3.1/all?fields=name&fields=cca3&fields=area');
    const ret = countries.reduce((result, country) => {
        result[country.cca3] = country;
        return result;
    }, {});
    localStorage.setItem('countriesList', JSON.stringify(ret));
    return ret;
}

async function loadCountryBorders(counryCode) {
    try {
        const data = await getData(` https://restcountries.com/v3/alpha/${counryCode}?fields=borders`);
        // eslint-disable-next-line no-use-before-define
        countryBorder.set(counryCode, data.borders);
        // eslint-disable-next-line no-restricted-properties, no-use-before-define
        localStorage.setItem('countryBorder', JSON.stringify(Object.fromEntries(countryBorder.entries())));
        return data.borders;
    } catch (error) {
        return {}; // Произошла ошибка и выводим пустоту
    }
}

async function GetBorders(counryCode) {
    // eslint-disable-next-line no-use-before-define
    if (!counrtyMap.has(counryCode)) {
        return []; // У невалидной страны нету границ
    }
    // eslint-disable-next-line no-use-before-define
    if (countryBorder.has(counryCode)) {
        // eslint-disable-next-line no-use-before-define
        return countryBorder.get(counryCode); // Если есть в кэше, то запрос делать не надо
    }
    const load = await loadCountryBorders(counryCode); // Если нету кэша, делаем запрос
    return load;
}

const form = document.getElementById('form');
const fromCountry = document.getElementById('fromCountry');
const toCountry = document.getElementById('toCountry');
const countriesList = document.getElementById('countriesList');
const submit = document.getElementById('submit');
const clearCache = document.getElementById('clearCache');
const output = document.getElementById('output');
const msgShowTime = 2000; // Время показа сообщения, ms
const counrtyMap = new Map(); // Для перекодирования кода в название
const counrtyMapReverce = new Map(); // Для перекодирования названия в код
const countryBorder = localStorage.hasOwnProperty('countryBorder') // Какие страны с какими граничат
    ? new Map(Object.entries(JSON.parse(localStorage.getItem('countryBorder'))))
    : new Map();
const mainArray = new Map(); // Основная мапа перебора стран, формат код_куда => код откуда

(async () => {
    fromCountry.disabled = true;
    toCountry.disabled = true;
    submit.disabled = true;
    clearCache.disabled = true;

    output.textContent = 'Loading…';
    // Берём из хранилища или скачиваем с сервера
    const countriesData = localStorage.hasOwnProperty('countriesList')
        ? JSON.parse(localStorage.getItem('countriesList'))
        : await loadCountriesData();
    output.textContent = '';

    // Заполняем список стран для подсказки в инпутах
    Object.keys(countriesData)
        .sort((a, b) => countriesData[b].area - countriesData[a].area)
        .forEach((code) => {
            const option = document.createElement('option');
            option.value = countriesData[code].name.common;
            countriesList.appendChild(option);
            counrtyMap.set(code, countriesData[code].name.common); // Формируем словарь кодов стран
            counrtyMapReverce.set(countriesData[code].name.common, code); // Формируем реверсивный словарь кодов стран
        });

    fromCountry.disabled = false;
    toCountry.disabled = false;
    submit.disabled = false;
    clearCache.disabled = false;

    console.clear();

    clearCache.addEventListener('click', async (event) => {
        countryBorder.clear();
        localStorage.removeItem('countryBorder');
        MsgAndClear('Cache is cleared');
    });

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        // TODO: Вывести, откуда и куда едем, и что идёт расчёт.
        // TODO: Рассчитать маршрут из одной страны в другую за минимум запросов.
        // TODO: Вывести маршрут и общее количество запросов.

        output.innerHTML = '';

        const from = fromCountry.value;
        // Проверка заполненности откуда
        if (!from) {
            MsgAndClear('Error: from country is not set');
            return;
        }
        if (!counrtyMapReverce.has(from)) {
            MsgAndClear('Error: from country is not valid');
            return;
        }
        const to = toCountry.value;
        // Проверка заполненности куда
        if (!to) {
            MsgAndClear('Error: to country is not set');
            return;
        }
        if (!counrtyMapReverce.has(to)) {
            MsgAndClear('Error: to country is not valid');
            return;
        }
        // Проверка на одно и то же
        // eslint-disable-next-line eqeqeq
        if (from == to) {
            MsgAndClear('Error: from country and to country are equal');
            return;
        }

        const fromCode = counrtyMapReverce.get(from);
        const toCode = counrtyMapReverce.get(to);

        fromCountry.disabled = true;
        toCountry.disabled = true;
        submit.disabled = true;
        clearCache.disabled = true;

        output.innerHTML = `Calculate route from <b>${from}</b> (${fromCode}) to <b>${to}</b> (${toCode})<br>`;

        mainArray.clear(); // Обязательно начинаем маршрут с чистого листа
        mainArray.set(fromCode, fromCode); // Родитель отсутствует (мы начали с него)

        let queryCount = 0; // Количество запросов
        let flag = 1; // Флаг ошибки
        let mainPointer = 0; // Счётчик шагов-стран (для выхода из цикла)
        // Обход лабиринта по левой стенке
        for (const [currentCountry, value] of mainArray) {
            // eslint-disable-next-line no-plusplus
            if (++mainPointer > 150) {
                // Максимум стран, для исключения зацикливания
                flag = 2;
                break;
            }
            // eslint-disable-next-line eqeqeq
            if (currentCountry == toCode) {
                // Достигли нужной страны
                flag = 0;
                break;
            }
            // Загружаем новые только если старые кончились
            if (mainArray.size >= mainPointer) {
                // eslint-disable-next-line no-plusplus
                queryCount++;
                // eslint-disable-next-line no-await-in-loop
                const borders = await GetBorders(currentCountry);
                // Из-за ошибки (например сетевой) стран может и не быть, проверяем
                if (borders.length) {
                    for (const border of borders) {
                        if (!mainArray.has(border)) {
                            // Добавляем только новые страны (чтобы дважды-трижды не обходить)
                            mainArray.set(border, currentCountry);
                        }
                    }
                }
            }
        }
        // eslint-disable-next-line eqeqeq
        if (flag == 0) {
            // Удача, нашли маршрут, формируем строку для вывода пользователю
            let end = toCode;
            let str = '';
            // eslint-disable-next-line eqeqeq
            while (end != fromCode) {
                if (str.length > 10000) {
                    break; // Чтобы кругами не ходил
                }
                // eslint-disable-next-line prefer-template
                str = ' → ' + counrtyMap.get(end) + str;
                end = mainArray.get(end);
            }
            str = from + str;
            output.innerHTML += str;
            // eslint-disable-next-line prefer-template
        }
        if (flag === 1) {
            output.innerHTML += 'Route not found: island or othrer continent';
        }
        if (flag === 2) {
            output.innerHTML += 'Route not found: query limit overflow';
        }
        output.innerHTML += `<br>Total query count: ${queryCount}`;

        fromCountry.disabled = false;
        toCountry.disabled = false;
        submit.disabled = false;
        clearCache.disabled = false;
    });

    function MsgAndClear(txt) {
        output.textContent = txt;
        setTimeout(() => (output.textContent = ''), msgShowTime);
    }
})();
