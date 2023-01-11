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

async function loadCountriesData(repeat = 3) {
    // repeat - количество повторов функции
    try {
        // Если без сетевых ошибок, то сразу возвращаем
        return await getData('https://restcountries.com/v3.1/all?fields=name&fields=cca3&fields=area');
    } catch (err) {
        // Если сетевая ошибка то вызываем повторно
        if (repeat > 0) {
            // eslint-disable-next-line no-return-await
            return await loadCountriesData(repeat - 1);
        }
        return {}; // Превысили лимит ошибок, возвращаем пустой объект
    }
}

async function GetCountriesData() {
    if (localStorage.hasOwnProperty('countriesList')) {
        // Если есть в кэше есть список стран, то сразу возвращаем
        return JSON.parse(localStorage.getItem('countriesList'));
    }
    const countries = await loadCountriesData();
    if (!countries.length) {
        return {};
    }
    const ret = countries.reduce((result, country) => {
        result[country.cca3] = country;
        return result;
    }, {});
    // Кешировал
    localStorage.setItem('countriesList', JSON.stringify(ret));
    return ret;
}

const counrtyMap = new Map(); // Для перекодирования кода в название
const countryBorder = localStorage.hasOwnProperty('countryBorder') // Какие страны с какими граничат
    ? new Map(Object.entries(JSON.parse(localStorage.getItem('countryBorder'))))
    : new Map();

async function loadCountryBorders(counryCode, repeat = 3) {
    try {
        const data = await getData(`https://restcountries.com/v3/alpha/${counryCode}?fields=borders`);
        if (!data.borders) {
            return {}; // Произошла логическая ошибка
        }
        return data.borders;
    } catch (error) {
        // Произошла сетевая ошибка, пытаемся вызвать повторно
        if (repeat > 0) {
            // eslint-disable-next-line no-return-await
            return await loadCountryBorders(counryCode, repeat - 1);
        }
        return {}; // Превышен лимит сетевых ошибок
    }
}

async function GetBorders(counryCode) {
    if (!counrtyMap.has(counryCode)) {
        return {}; // У невалидной страны нету границ
    }
    if (countryBorder.has(counryCode)) {
        return countryBorder.get(counryCode); // Если есть в кэше, то запрос делать не надо
    }
    const borders = await loadCountryBorders(counryCode);
    if (borders.length) {
        // Если запрос без ошибок - кешируем
        countryBorder.set(counryCode, borders);
        localStorage.setItem('countryBorder', JSON.stringify(Object.fromEntries(countryBorder)));
    }
    return borders;
}

// Тип Enum для хранения ошибок  https://myrusakov.ru/js-enum-type.html
function Enum(obj) {
    const newObj = {};
    for (const prop in obj) {
        if (obj.hasOwnProperty(prop)) {
            newObj[prop] = Symbol(obj[prop]);
        }
    }
    return Object.freeze(newObj);
}

const form = document.getElementById('form');
const fromCountry = document.getElementById('fromCountry');
const toCountry = document.getElementById('toCountry');
const countriesList = document.getElementById('countriesList');
const submit = document.getElementById('submit');
const clearCache = document.getElementById('clearCache');
const output = document.getElementById('output');
const msgShowTime = 2000; // Время показа сообщения, ms
const counrtyMapReverce = new Map(); // Для перекодирования названия в код
const mainArray = new Map(); // Основная мапа перебора стран, формат код_куда => код откуда
const Errors = Enum({ NoError: 0, NotFoundError: 1, OverfolwError: 2 });

(async () => {
    fromCountry.disabled = true;
    toCountry.disabled = true;
    submit.disabled = true;
    clearCache.disabled = true;

    output.textContent = 'Loading…';
    // Берём из хранилища или скачиваем с сервера
    const countriesData = await GetCountriesData();
    if (!countriesData) {
        output.innerHTML = "Fatal error: countries can't be loading... <a href='/'>Try again (F5)</a>";
        return;
    }

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

    // console.clear();

    clearCache.addEventListener('click', async (event) => {
        countryBorder.clear();
        localStorage.removeItem('countryBorder');
        MsgAndHide('Cache is cleared');
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
            MsgAndHide('Error: from country is not set');
            return;
        }
        if (!counrtyMapReverce.has(from)) {
            MsgAndHide('Error: from country is not valid');
            return;
        }
        const to = toCountry.value;
        // Проверка заполненности куда
        if (!to) {
            MsgAndHide('Error: to country is not set');
            return;
        }
        if (!counrtyMapReverce.has(to)) {
            MsgAndHide('Error: to country is not valid');
            return;
        }
        // Проверка на одно и то же
        // eslint-disable-next-line eqeqeq
        if (from == to) {
            MsgAndHide('Error: from country and to country are equal');
            return;
        }

        const fromCode = counrtyMapReverce.get(from);
        const toCode = counrtyMapReverce.get(to);

        fromCountry.disabled = true;
        toCountry.disabled = true;
        submit.disabled = true;
        clearCache.disabled = true;

        output.innerHTML = `Calculating route from <b>${from}</b> (${fromCode}) to <b>${to}</b> (${toCode}). Please wait...<br>`;

        mainArray.clear(); // Обязательно начинаем маршрут с чистого листа
        mainArray.set(fromCode, fromCode); // Родитель отсутствует (мы начали с него)

        let queryCount = 0; // Количество запросов
        let error = Errors.NotFoundError; // Флаг ошибки
        let mainPointer = 0; // Счётчик шагов-стран (для выхода из цикла)
        // Обход лабиринта по левой стенке
        for (const [currentCountry, value] of mainArray) {
            // eslint-disable-next-line no-plusplus
            if (++mainPointer > 150) {
                // Максимум стран, для исключения зацикливания
                error = Errors.OverfolwError;
                break;
            }
            // eslint-disable-next-line eqeqeq
            if (currentCountry == toCode) {
                // Достигли нужной страны
                error = Errors.NoError;
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
        if (error === Errors.NoError) {
            // Удача, нашли маршрут, пихаем его в массив с начальной точки
            const route = [from];
            let end = toCode;
            while (end !== fromCode) {
                route.push(counrtyMap.get(end));
                end = mainArray.get(end);
                if (route.length > 100) {
                    break; // Ловит внутренние ошибки программы
                }
            }
            output.innerHTML += route.join(' → ');
        }
        if (error === Errors.NotFoundError) {
            output.innerHTML += 'Route not found: island or othrer continent';
        }
        if (error === Errors.OverfolwError) {
            output.innerHTML += 'Route not found: query limit overflow';
        }
        output.innerHTML += `<br>Total query count: ${queryCount}`;

        fromCountry.disabled = false;
        toCountry.disabled = false;
        submit.disabled = false;
        clearCache.disabled = false;
    });

    function MsgAndHide(txt) {
        output.textContent = txt;
        setTimeout(() => (output.textContent = ''), msgShowTime);
    }
})();
