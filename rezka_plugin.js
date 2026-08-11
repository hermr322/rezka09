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
        
        Lampa.SettingsApi.addParam({
            component: componentId,
            param: { name: 'hdrezka_password', type: 'title' },
            field: { name: 'Хэш пароля (dle_password)', description: Lampa.Storage.get('hdrezka_password') ? '********' : 'Нажмите для ввода (из cookies сайта)' },
            onRender: function (item) {
                item.on('hover:enter click', function () {
                    Lampa.Input.edit({
                        title: 'Хэш пароля (dle_password)',
                        value: Lampa.Storage.get('hdrezka_password', ''),
                        free: true,
                        nosave: true
                    }, function (new_val) {
                        Lampa.Storage.set('hdrezka_password', new_val);
                        item.find('.settings-param__desr').text(new_val ? '********' : 'Нажмите для ввода (из cookies сайта)');
                    });
                });
            }
        });

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

    function describeNetworkError(prefix, jqXHR, url) {
        var proxy = Lampa.Storage.get('hdrezka_cors_proxy', '');
        var status = jqXHR && jqXHR.status ? jqXHR.status : 0;
        var msg = prefix + '. ';
        
        console.error('HDRezka Network Error:', prefix, '| URL:', url, '| Proxy:', proxy, '| Status:', status, '| Response:', jqXHR ? (jqXHR.responseText ? jqXHR.responseText.substring(0, 200) : '') : '');
        
        if (status === 0) {
            if (!proxy && typeof window !== 'undefined' && window.location.protocol.indexOf('http') === 0) {
                msg += 'CORS-прокси не задан, укажите его в настройках плагина.';
            } else if (proxy) {
                msg += 'Ответа нет. Проверьте: работает ли сам прокси, правильный ли формат, не заблокировано ли зеркало провайдером.';
            } else {
                msg += 'Сетевая ошибка (CORS или блокировка).';
            }
        } else {
            msg += 'Сервер вернул код ' + status + ' (возможно, бан или капча).';
        }
        
        Lampa.Noty.show(msg);
    }

    function networkRequest(url, type, data, onSuccess, onError) {
        if (typeof Lampa !== 'undefined' && typeof Lampa.Reguest === 'function') {
            var net = new Lampa.Reguest();
            if (type === 'POST') {
                net.silent(url, onSuccess, onError, data);
            } else {
                net.silent(url, onSuccess, onError);
            }
        } else {
            var ajaxOpts = {
                url: url,
                type: type,
                success: onSuccess,
                error: onError
            };
            if (type === 'POST') {
                ajaxOpts.data = data;
                ajaxOpts.contentType = 'application/x-www-form-urlencoded';
            }
            $.ajax(ajaxOpts);
        }
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

                networkRequest(url, 'GET', null, 
                    function (result) {
                        this.parseHTML(result);
                        this.build();
                    }.bind(this),
                    function (jqXHR) {
                        describeNetworkError('Ошибка загрузки закладок', jqXHR, url);
                        this.empty();
                    }.bind(this)
                );

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
        // Check if string contains typical base64 characters and might be encoded
        if (str.indexOf('#h') === 0 || str.match(/(_|X|\/|\\|!|\^|b|@)/)) {
            if (str.indexOf('#h') === 0) {
                str = str.substring(2);
            }
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
                var url = match[2].trim();
                // Handle multiple mirrors in same quality like: url1 or url2
                if (url.indexOf(' or ') !== -1) {
                    url = url.split(' or ')[0].trim();
                }
                streams.push({
                    title: match[1],
                    url: url
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
        networkRequest(searchUrl, 'GET', null, 
            function(html) {
                try {
                    var parser = new DOMParser();
                    var doc = parser.parseFromString(html, 'text/html');
                    var items = doc.querySelectorAll('.b-content__inline_item');
                    var bestMatch = null;
                    items.forEach(function(item) {
                        var linkEl = item.querySelector('.b-content__inline_item-link a');
                        var infoEl = item.querySelector('.b-content__inline_item-link div');
                        if (linkEl) {
                            var itemTitle = linkEl.textContent.trim().toLowerCase();
                            var itemInfo = infoEl ? infoEl.textContent : '';
                            var itemYearMatch = itemInfo.match(/\d{4}/);
                            var itemYear = itemYearMatch ? itemYearMatch[0] : '';
                            
                            // Compare normalized title and year
                            var titleMatch = itemTitle === title.toLowerCase();
                            
                            if (titleMatch && !bestMatch) bestMatch = linkEl.getAttribute('href');
                            if (year && itemYear === year && titleMatch) {
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
                    console.error("HDRezka Search Error", e);
                    Lampa.Noty.show('Ошибка обработки поиска');
                }
            },
            function(jqXHR) {
                describeNetworkError('Ошибка при поиске', jqXHR, searchUrl);
            }
        );
        } catch (err) {
            Lampa.Noty.show('Ошибка поиска (общ): ' + err.message);
        }
    }

    function loadMoviePage(href, movie) {
        Lampa.Noty.show('Загрузка данных...');
        var url = buildRequestUrl(href);
        networkRequest(url, 'GET', null, 
            function(html) {
                try {
                    var parser = new DOMParser();
                    var doc = parser.parseFromString(html, 'text/html');
                    
                    var postInput = doc.querySelector('#post_id');
                    var postId = postInput ? postInput.value : null;
                    if (!postId) {
                        Lampa.Noty.show('Ошибка парсинга ID');
                        return;
                    }

                    var trashList = getTrashList(html);
                    
                    var transNodes = doc.querySelectorAll('#translators-list li');
                    var translators = [];
                    transNodes.forEach(function(node) {
                        translators.push({
                            title: node.getAttribute('title') || node.textContent.trim(),
                            id: node.getAttribute('data-translator_id'),
                            selected: node.classList.contains('active')
                        });
                    });

                    if (translators.length === 0) {
                        translators.push({ title: 'По умолчанию', id: 'default' });
                    }

                    var isSeries = doc.querySelector('[data-season_id]') || doc.querySelector('.b-simple_season__item');

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
                    console.error("HDRezka Page Parse Error", e);
                    Lampa.Noty.show('Ошибка парсинга страницы');
                }
            },
            function(jqXHR) {
                describeNetworkError('Ошибка загрузки страницы', jqXHR, url);
            }
        );
    }

    function loadSeries(postId, translatorId, movie, trashList) {
        Lampa.Noty.show('Загрузка эпизодов...');
        
        var apiUrl = buildRequestUrl('/ajax/get_episodes/');
        
        // If translator is default, don't pass it so server uses default
        var data = 'id=' + postId + '&action=get_episodes';
        if (translatorId !== 'default') data += '&translator_id=' + translatorId;
        
        networkRequest(apiUrl, 'POST', data, 
            function (res) {
                try {
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
                } catch(e) {
                    console.error("HDRezka Episodes Parse Error", e);
                    Lampa.Noty.show('Ошибка парсинга эпизодов');
                }
            },
            function (jqXHR) {
                describeNetworkError('Ошибка загрузки эпизодов', jqXHR, apiUrl);
            }
        );
    }

    function fetchStream(postId, translatorId, season, episode, movie, trashList) {
        Lampa.Noty.show('Получение видео...');
        
        var isSeries = (season && episode);
        var action = isSeries ? 'get_stream' : 'get_movie';
        var endpoint = isSeries ? '/ajax/get_cdn_series/' : '/ajax/get_play_video/';
        
        var apiUrl = buildRequestUrl(endpoint);

        var data = 'id=' + postId + '&action=' + action;
        if (translatorId !== 'default') data += '&translator_id=' + translatorId;
        
        if (isSeries) {
            data += '&season=' + season + '&episode=' + episode;
        }

        networkRequest(apiUrl, 'POST', data, 
            function (res) {
                try {
                    if (res && res.url) {
                        var decoded = decodeUrl(res.url, trashList);
                        var streams = parseStreams(decoded);
                        if (streams.length > 0) {
                            var videoItem = {
                                title: movie.title,
                                url: streams[streams.length - 1].url, // last is usually highest
                                quality: {}
                            };
                            
                            streams.forEach(function(s) {
                                videoItem.quality[s.title] = s.url;
                            });

                            Lampa.Player.playlist([videoItem]);
                            Lampa.Player.play(videoItem);
                        } else {
                            Lampa.Noty.show('Не удалось разобрать ссылки на видео');
                        }
                    } else {
                        Lampa.Noty.show('Видео не найдено');
                    }
                } catch(e) {
                    console.error("HDRezka Stream Parse Error", e);
                    Lampa.Noty.show('Ошибка парсинга потока');
                }
            },
            function (jqXHR) {
                describeNetworkError('Ошибка получения видео', jqXHR, apiUrl);
            }
        );
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
