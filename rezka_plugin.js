(function () {
    'use strict';

    var pluginName = 'HDRezka Lampa';
    var componentId = 'hdrezka_plugin';

    function initSettings() {
        if (!window.Lampa || !Lampa.SettingsApi) return;

        if(Lampa.SettingsApi.addComponent) {
            Lampa.SettingsApi.addComponent({
                component: componentId,
                name: 'HDRezka',
                icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>'
            });
        }

        function addTextField(name, title, desc, defaultValue) {
            Lampa.SettingsApi.addParam({
                component: componentId,
                param: { name: name, type: 'title' },
                field: { name: title, description: Lampa.Storage.get(name, defaultValue) || desc },
                onRender: function (item) {
                    item.on('hover:enter click', function () {
                        Lampa.Input.edit({
                            title: title,
                            value: Lampa.Storage.get(name, defaultValue),
                            free: true,
                            nosave: true
                        }, function (new_val) {
                            Lampa.Storage.set(name, new_val);
                            item.find('.settings-param__desr').text(new_val || desc);
                        });
                    });
                }
            });
        }

        addTextField('hdrezka_mirror', 'Зеркало HDRezka', 'Нажмите для ввода (по умолчанию https://rezka.ag)', 'https://rezka.ag');
        addTextField('hdrezka_user_id', 'ID Пользователя (dle_user_id)', 'Нажмите для ввода (из cookies сайта)', '');
        addTextField('hdrezka_password', 'Хэш пароля (dle_password)', 'Нажмите для ввода (из cookies сайта)', '');
        addTextField('hdrezka_cors_proxy', 'CORS Прокси', 'Нажмите для ввода', '');
    }

    function buildRequestUrl(path) {
        var mirror = Lampa.Storage.get('hdrezka_mirror', 'https://rezka.ag');
        var proxy = Lampa.Storage.get('hdrezka_cors_proxy', '');
        if (mirror && mirror.charAt(mirror.length - 1) === '/') mirror = mirror.slice(0, -1);
        var targetUrl = (path.indexOf('http') === 0) ? path : (mirror + (path.indexOf('/') === 0 ? path : '/' + path));
        if (proxy) return proxy + encodeURIComponent(targetUrl);
        return targetUrl;
    }

    function getHeaders() {
        var userId = Lampa.Storage.get('hdrezka_user_id', '');
        var userPass = Lampa.Storage.get('hdrezka_password', '');
        var headers = {};
        if (userId && userPass) {
            headers['Cookie'] = 'dle_user_id=' + userId + '; dle_password=' + userPass + ';';
        }
        return headers;
    }

    // --- Bookmarks Logic ---
    function createHDRezkaFavsComponent() {
        var component = function (object) {
            var comp = new Lampa.Interaction();
            var scroll = new Lampa.Scroll({ mask: true, over: true });
            var items = [];
            var html = document.createElement('div');
            
            this.create = function () {
                this.activity.loader(true);
                var url = buildRequestUrl('/favorites/');

                $.ajax({
                    url: url,
                    type: 'GET',
                    headers: getHeaders(),
                    success: function (result) {
                        this.parseHTML(result);
                        this.build();
                    }.bind(this),
                    error: function (jqXHR) {
                        Lampa.Noty.show('Ошибка закладок. Код: ' + (jqXHR.status || 'CORS/Сетевая'));
                        this.empty();
                    }.bind(this)
                });

                return this.render();
            };

            this.empty = function () {
                var empty = new Lampa.Empty();
                html.appendChild(empty.render(true));
                this.start = empty.start;
                this.activity.loader(false);
                this.activity.toggle();
            };

            this.parseHTML = function (htmlString) {
                var parser = new DOMParser();
                var doc = parser.parseFromString(htmlString, 'text/html');
                var elements = doc.querySelectorAll('.b-content__inline_item');
                
                if (elements.length === 0) {
                    Lampa.Noty.show('Закладки не найдены.');
                    this.empty();
                    return;
                }

                elements.forEach(function (el) {
                    var linkEl = el.querySelector('.b-content__inline_item-link a');
                    var imgEl = el.querySelector('img');
                    var infoEl = el.querySelector('.b-content__inline_item-link div');
                    
                    if (linkEl && imgEl) {
                        var title = linkEl.textContent.trim();
                        var yearMatch = infoEl ? infoEl.textContent.trim().match(/\d{4}/) : null;
                        
                        items.push({
                            title: title,
                            original_title: title,
                            poster: imgEl.getAttribute('src'),
                            year: yearMatch ? yearMatch[0] : '',
                            url: linkEl.getAttribute('href'),
                            type: 'movie'
                        });
                    }
                });
            };

            this.build = function () {
                this.activity.loader(false);
                scroll.render().addClass('layer--w100');
                html.appendChild(scroll.render()[0]);

                var row = document.createElement('div');
                row.className = 'scroll__row';

                items.forEach(function (item) {
                    var card = new Lampa.Card(item, { card_category: true });
                    card.create();
                    card.onEnter = function () {
                        // Open full card in Lampa
                        Lampa.Activity.push({
                            url: '',
                            title: 'HDRezka',
                            component: 'full',
                            movie: item,
                            page: 1
                        });
                    };
                    row.appendChild(card.render()[0]);
                });

                scroll.append(row);
                this.activity.toggle();
            };

            this.start = function () {
                Lampa.Controller.add('content', {
                    toggle: function () { Lampa.Controller.collectionSet(scroll.render()); Lampa.Controller.collectionFocus(false, scroll.render()); },
                    left: function () { if (Lampa.Controller.collectionFocus(scroll.render(), 'left')) Lampa.Controller.toggle('menu'); },
                    right: function () { Lampa.Controller.collectionFocus(scroll.render(), 'right'); },
                    up: function () { Lampa.Controller.collectionFocus(scroll.render(), 'up'); },
                    down: function () { Lampa.Controller.collectionFocus(scroll.render(), 'down'); },
                    back: function () { Lampa.Activity.backward(); }
                });
                Lampa.Controller.toggle('content');
            };

            this.pause = function () {};
            this.stop = function () {};
            this.render = function () { return html; };
            this.destroy = function () { scroll.destroy(); };
        };

        Lampa.Component.add('hdrezka_favs', component);
    }

    function addMenuItem() {
        if (!window.Lampa) return;
        Lampa.Listener.follow('menu', function (e) {
            if (e.type === 'ready') {
                var btn = $('<li class="menu__item selector"><div class="menu__ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg></div><div class="menu__text">Закладки HDRezka</div></li>');
                btn.on('hover:enter', function () {
                    Lampa.Activity.push({ url: '', title: 'Закладки HDRezka', component: 'hdrezka_favs', page: 1 });
                });
                Lampa.Menu.render().find('.menu__list').append(btn);
            }
        });
    }

    // --- Balancer Logic ---

    function getTrashList(html) {
        var defaultTrash = ["@_@","b_b","^!_!^","X/x/","//_//","\\\\|\\\\|"];
        var match = html.match(/trashList\s*=\s*(\[[^\]]+\])/) || html.match(/trashList["']?\s*:\s*(\[[^\]]+\])/);
        if (match) {
            try { return JSON.parse(match[1].replace(/'/g, '"')); } catch(e) {}
        }
        return defaultTrash;
    }

    function decodeUrl(encodedStr, trashList) {
        var str = encodedStr;
        if (str.indexOf('#h') === 0) {
            str = str.substring(2);
            trashList.forEach(function(trash) {
                str = str.split(trash).join('');
            });
            try {
                str = atob(str);
            } catch(e) {
                console.error("HDRezka Base64 Decode Error", e);
            }
        }
        return str;
    }

    function parseStreams(decodedStr) {
        // Ex: "[1080p]https://.../1080p.mp4 or m3u8,[720p]https://.../720p.mp4"
        var streams = [];
        var parts = decodedStr.split(',');
        parts.forEach(function(part) {
            var match = part.match(/\[([^\]]+)\](.*)/);
            if (match) {
                streams.push({
                    title: match[1],
                    url: match[2].trim()
                });
            } else if (part.trim().indexOf('http') === 0) {
                streams.push({
                    title: 'Auto',
                    url: part.trim()
                });
            }
        });
        return streams;
    }

    function openRezkaBalancer(movie) {
        try {
            var title = movie.original_title || movie.title || movie.original_name || movie.name;
            var releaseDate = movie.release_date || movie.first_air_date;
            var year = releaseDate ? releaseDate.substring(0, 4) : '';
            var searchUrl = buildRequestUrl('/index.php?do=search&subaction=search&q=' + encodeURIComponent(title));
            
            Lampa.Noty.show('Поиск на HDRezka: ' + title);

        $.ajax({
            url: searchUrl,
            type: 'GET',
            headers: getHeaders(),
            success: function(html) {
                try {
                    var parser = new DOMParser();
                    var doc = parser.parseFromString(html, 'text/html');
                    var items = doc.querySelectorAll('.b-content__inline_item');
                    
                    var bestMatch = null;
                    items.forEach(function(item) {
                        var linkEl = item.querySelector('.b-content__inline_item-link a');
                        var infoEl = item.querySelector('.b-content__inline_item-link div');
                        if (linkEl) {
                            var itemTitle = linkEl.textContent.trim();
                            var itemInfo = infoEl ? infoEl.textContent : '';
                            var itemYearMatch = itemInfo.match(/\d{4}/);
                            var itemYear = itemYearMatch ? itemYearMatch[0] : '';
                            
                            // Simple heuristic: year match is very strong
                            if (!bestMatch) bestMatch = linkEl.getAttribute('href');
                            if (year && itemYear === year) {
                                bestMatch = linkEl.getAttribute('href');
                            }
                        }
                    });

                    if (bestMatch) {
                        loadMoviePage(bestMatch, movie);
                    } else {
                        Lampa.Noty.show('Не найдено на HDRezka');
                    }
                } catch (e) {
                    Lampa.Noty.show('Ошибка поиска: ' + e.message);
                }
            },
            error: function(jqXHR) {
                Lampa.Noty.show('Ошибка поиска. Код: ' + (jqXHR.status || 'CORS/Сетевая'));
            }
        });
        } catch (err) {
            Lampa.Noty.show('Ошибка поиска (общ): ' + err.message);
        }
    }

    function loadMoviePage(href, movie) {
        Lampa.Noty.show('Загрузка данных...');
        var url = buildRequestUrl(href);
        $.ajax({
            url: url,
            type: 'GET',
            headers: getHeaders(),
            success: function(html) {
                try {
                    var matchId = html.match(/id="post_id"\s*name="post_id"\s*value="(\d+)"/);
                    var postId = matchId ? matchId[1] : null;
                    if (!postId) {
                        Lampa.Noty.show('Ошибка парсинга ID');
                        return;
                    }

                    var trashList = getTrashList(html);
                    
                    var parser = new DOMParser();
                    var doc = parser.parseFromString(html, 'text/html');
                    
                    var translators = [];
                    var transNodes = doc.querySelectorAll('#translators-list li');
                    transNodes.forEach(function(node) {
                        translators.push({
                            title: node.getAttribute('title') || node.textContent.trim(),
                            id: node.getAttribute('data-translator_id'),
                            selected: node.classList.contains('active')
                        });
                    });

                    if (translators.length === 0) {
                        // Check if single default translator exists in init
                        var defTransMatch = html.match(/sof\.tv\.init\(\{.*"translator_id":(\d+)/);
                        var transId = defTransMatch ? defTransMatch[1] : null;
                        translators.push({ title: 'По умолчанию', id: transId || 'default' });
                    }

                    var isSeries = html.indexOf('data-season_id') !== -1 || html.indexOf('b-simple_season__item') !== -1;

                    if (translators.length > 1) {
                        Lampa.Select.show({
                            title: 'Выберите озвучку',
                            items: translators,
                            onSelect: function(t) {
                                if (isSeries) loadSeries(postId, t.id, movie, trashList);
                                else fetchStream(postId, t.id, null, null, movie, trashList);
                            },
                            onBack: function() { Lampa.Controller.toggle('content'); }
                        });
                    } else {
                        if (isSeries) loadSeries(postId, translators[0].id, movie, trashList);
                        else fetchStream(postId, translators[0].id, null, null, movie, trashList);
                    }
                } catch (e) {
                    Lampa.Noty.show('Ошибка стр. фильма: ' + e.message);
                }
            },
            error: function(jqXHR) {
                Lampa.Noty.show('Ошибка страницы. Код: ' + (jqXHR.status || 'CORS/Сетевая'));
            }
        });
    }

    function loadSeries(postId, translatorId, movie, trashList) {
        Lampa.Noty.show('Загрузка эпизодов...');
        
        var mirror = Lampa.Storage.get('hdrezka_mirror', 'https://rezka.ag');
        var proxy = Lampa.Storage.get('hdrezka_cors_proxy', '');
        if (mirror && mirror.charAt(mirror.length - 1) === '/') mirror = mirror.slice(0, -1);
        
        var apiUrl = mirror + '/ajax/get_episodes/';
        if (proxy) apiUrl = proxy + encodeURIComponent(apiUrl);

        var data = 'id=' + postId + '&translator_id=' + translatorId + '&action=get_episodes';
        
        // Use jquery ajax because Lampa.network.request POST with forms via simple API can be tricky
        // But Lampa.network supports POST.
        $.ajax({
            url: apiUrl,
            type: 'POST',
            data: data,
            headers: getHeaders(),
            success: function (res) {
                var html = res.episodes || res; // depending on response format
                var parser = new DOMParser();
                var doc = parser.parseFromString(html, 'text/html');
                
                var seasonsNodes = doc.querySelectorAll('.b-simple_season__item');
                var seasons = [];
                seasonsNodes.forEach(function(s) {
                    seasons.push({
                        title: 'Сезон ' + s.getAttribute('data-tab_id'),
                        id: s.getAttribute('data-tab_id')
                    });
                });

                if (seasons.length > 0) {
                    Lampa.Select.show({
                        title: 'Выберите сезон',
                        items: seasons,
                        onSelect: function(season) {
                            var epNodes = doc.querySelectorAll('.b-simple_episode__item[data-season_id="'+season.id+'"]');
                            var episodes = [];
                            epNodes.forEach(function(e) {
                                episodes.push({
                                    title: 'Эпизод ' + e.getAttribute('data-episode_id'),
                                    id: e.getAttribute('data-episode_id'),
                                    season: season.id
                                });
                            });
                            Lampa.Select.show({
                                title: 'Выберите эпизод',
                                items: episodes,
                                onSelect: function(episode) {
                                    fetchStream(postId, translatorId, season.id, episode.id, movie, trashList);
                                },
                                onBack: function() { Lampa.Controller.toggle('content'); }
                            });
                        },
                        onBack: function() { Lampa.Controller.toggle('content'); }
                    });
                } else {
                    Lampa.Noty.show('Сезоны не найдены');
                }
            },
            error: function (jqXHR) {
                Lampa.Noty.show('Ошибка эпизодов. Код: ' + (jqXHR.status || 'CORS/Сетевая'));
            }
        });
    }

    function fetchStream(postId, translatorId, season, episode, movie, trashList) {
        Lampa.Noty.show('Получение видео...');
        
        var isSeries = (season && episode);
        var action = isSeries ? 'get_episodes' : 'get_movie';
        var endpoint = isSeries ? '/ajax/get_cdn_series/' : '/ajax/get_play_video/';
        
        var mirror = Lampa.Storage.get('hdrezka_mirror', 'https://rezka.ag');
        var proxy = Lampa.Storage.get('hdrezka_cors_proxy', '');
        if (mirror && mirror.charAt(mirror.length - 1) === '/') mirror = mirror.slice(0, -1);
        var apiUrl = mirror + endpoint;
        if (proxy) apiUrl = proxy + encodeURIComponent(apiUrl);

        var data = 'id=' + postId + '&translator_id=' + translatorId + '&action=' + action;
        if (isSeries) {
            data += '&season=' + season + '&episode=' + episode;
        }

        $.ajax({
            url: apiUrl,
            type: 'POST',
            data: data,
            headers: getHeaders(),
            success: function (res) {
                if (res && res.url) {
                    var decoded = decodeUrl(res.url, trashList);
                    var streams = parseStreams(decoded);
                    if (streams.length > 0) {
                        // Usually Lampa Player takes an object with url
                        // We will play the highest quality or first by default, 
                        // or better: let the user select quality if we mapped them to Lampa playlist format.
                        
                        var playlist = [];
                        streams.forEach(function(s) {
                            playlist.push({
                                title: movie.title + ' (' + s.title + ')',
                                url: s.url
                            });
                        });
                        
                        // Just play the best (last) or show quality selector
                        // Lampa.Player.play requires a single file or playlist.
                        var videoItem = {
                            title: movie.title,
                            url: streams[streams.length - 1].url, // last is usually highest
                            quality: {}
                        };
                        
                        streams.forEach(function(s) {
                            videoItem.quality[s.title] = s.url;
                        });

                        Lampa.Player.play(videoItem);
                        Lampa.Player.playlist([videoItem]);
                    } else {
                        Lampa.Noty.show('Не удалось разобрать ссылки на видео');
                    }
                } else {
                    Lampa.Noty.show('Видео не найдено');
                }
            },
            error: function (jqXHR) {
                Lampa.Noty.show('Ошибка видео. Код: ' + (jqXHR.status || 'CORS/Сетевая'));
            }
        });
    }

    // Hook into full card
    if (window.Lampa) {
        Lampa.Listener.follow('full', function (e) {
            if (e.type === 'complite') {
                var btn = $('<div class="full-start__button selector button--hdrezka" style="background-color: #d12e2e; border-radius: 30px; display: inline-flex; align-items: center; justify-content: center; padding: 10px 20px; margin: 10px 10px 10px 0;"><div class="full-start__button-icon" style="margin-right: 10px; width: 24px; height: 24px;"><svg viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg></div><div class="full-start__button-text" style="color: white; font-weight: bold;">Смотреть (HDRezka)</div></div>');
                btn.on('hover:enter click', function () {
                    try {
                        openRezkaBalancer(e.data.movie);
                    } catch (err) {
                        Lampa.Noty.show('Ошибка кнопки: ' + err.message);
                    }
                });
                
                var render = e.object.activity.render();
                
                // Try finding the play button first
                var playBtn = render.find('.button--play, [data-action="play"]');
                if (playBtn.length) {
                    playBtn.after(btn);
                } else {
                    // Fallback to various known button containers
                    var buttonsContainer = render.find('.full-start__buttons, .view--actions, .view__actions, .info__buttons, .buttons__row');
                    if (buttonsContainer.length) {
                        buttonsContainer.append(btn);
                    } else {
                        // Last resort fallback
                        render.find('.full-start__info').append(btn);
                    }
                }
            }
        });

        Lampa.Listener.follow('app', function (e) {
            if (e.type == 'ready') {
                initSettings();
                createHDRezkaFavsComponent();
                addMenuItem();
            }
        });
    }

})();
