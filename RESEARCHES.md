# Исследования Lulio: функции оригинала и помощник сна

Исследование оригинала: 22 октября 2026 года. Проектирование: 23 октября 2026 года.

Статус: этапы 0–1 приняты координатором для локальной разработки; реализация и доказательства этапа 2 записаны ниже, его принятие и запуск следующей сессии остаются за координатором. Согласованные платформы уведомлений: **Android APK + iPhone PWA**. Поэтапный план раздела 10 утверждён 23 октября 2026 года. Числовые параметры — немедицинские инженерные гипотезы, не доказанная точность или доставка уведомлений.

## 1. Цель и метод

Сравнить Lulio с приложением **«Скачки роста и развитие малыша» от Sprouty ltd**, особенно в сценарии подготовки ребёнка ко сну. Спроектировать связку:

**Индивидуальный режим → прогноз → время подготовки → своевременное уведомление.**

Основания:

- публичное описание App Store и официальная справка Sprouty;
- чтение существующего кода, README.md и SPEC.md;
- изолированный запуск существующего расчёта бодрствования с синтетическими данными.

Платное приложение Sprouty на устройстве не тестировалось. Публичные описания подтверждают заявления разработчика, но не точность прогнозов и не фактическую доставку уведомлений. Полная формула оригинала неизвестна. Подтверждения использования ML/нейросети нет.

## 2. Первичные источники

1. [App Store: «Скачки роста и развитие малыша», Sprouty ltd](https://apps.apple.com/ru/app/id1662980687).
2. [Как приложение рассчитывает расписание сна](https://sprouty.app/ru/biblioteka-zdorovya/app/как-приложение-рассчитывает-расписание-сна).
3. [Как читать статистику сна — и что она может рассказать о вашем малыше](https://sprouty.app/ru/biblioteka-zdorovya/app/как-читать-статистику-сна-и-что-она-может-рассказать-о-вашем-малыше).
4. [Ритуалы на засыпание: как готовиться к дневному и ночному сну](https://sprouty.app/ru/biblioteka-zdorovya/son/ritualy-na-zasypanie-kak-gotovitsya-k-dnevnomu-i-nochnomu-snu).
5. [Библиотека здоровья: сон](https://sprouty.app/ru/biblioteka-zdorovya/son/index.html).
6. [Справка по функциям приложения](https://sprouty.app/ru/biblioteka-zdorovya/app).

Содержимое источников может меняться. Выводы относятся к прочитанным страницам, а не ко всем историческим версиям оригинала.

## 3. Подтверждённые возможности оригинала

### 3.1. Расписание сна

По источнику 2 приложение учитывает возраст, заданное время ночного сна, количество дневных снов, записи о сне и пробуждениях. Если отслеживаются укладывания, учитывается и этот этап.

Заявленное поведение:

- прогноз следующего дневного сна, остальных дневных снов и ухода в ночь;
- пересчёт оставшегося дня после начала и окончания сна;
- пересчёт всего дня после завершения ночного сна;
- оценка предполагаемой продолжительности сна;
- старт по возрастным ориентирам при недостатке истории;
- заблаговременное напоминание о предстоящем сне;
- расчёт времени подготовки при отслеживании укладываний;
- плавное изменение времени ухода в ночь, примерно на 10–15 минут в день;
- предупреждение о необычно долго работающем таймере;
- исключение потенциально ошибочных записей;
- отсутствие вывода «сон пропущен» только на основании отсутствующей записи.

Точный интервал опережения автоматического напоминания, транспорт уведомлений и полная формула расчёта в прочитанной справке не раскрыты.

### 3.2. Трекеры и статистика

По источникам 1 и 3:

- сон, грудное кормление, бутылочка, подгузники, сцеживания, настроение;
- таймеры на экране блокировки;
- разовые напоминания, ежедневные и по выбранным дням;
- настраиваемый ночной интервал;
- паузы сна и отдельный учёт ночных пробуждений;
- показатели подъёма, засыпания, дневного и ночного бодрствования;
- суточный сон как связка последнего ночного сна и дневных снов;
- недельная статистика с учётом дней, в которых есть записи.

Это методика оригинала, а не требование автоматически изменить методику Lulio.

### 3.3. Другие функции

В App Store заявлены:

- сравнение роста, веса и окружности головы со стандартами ВОЗ;
- более 230 развивающих занятий, ежедневная подборка и чеклист выполнения;
- дневник памятных достижений с возможностью поделиться;
- приглашение близких для семейного доступа;
- режим беременности;
- поддержка Apple Watch;
- 11 скачков роста и подсказки о следующем скачке на основе данных трекеров.

Последнее — заявление разработчика, а не доказанная медицинская прогностическая модель. Количество скачков само по себе не является показателем качества.

Материалы о дневных и ночных ритуалах подтверждены источником 4. Наличие редактора собственного пошагового ритуала с чеклистом не подтверждено.

## 4. Текущее состояние Lulio

### 4.1. Что уже есть

- Локальный дневник, таймеры сна и грудного кормления.
- Ручные записи сна, бутылочки, прикорма, сцеживания, подгузников и измерений.
- Возрастные ориентиры бодрствования и текстовая подсказка «Пора готовиться ко сну».
- Статистика за 7/14/30 дней, график суточного ритма, средние длительности и история измерений.
- Календарь 10 скачков на 75 недель от ПДР с описаниями и дисклеймером.
- JSON-резервирование.
- Автоматическая синхронизация Supabase либо ручной обмен через Яндекс Диск; одновременно включить оба транспорта нельзя.
- В Android APK — тихие уведомления с текущими таймерами.

### 4.2. Чего нет в сценарии сна

| Возможность | Состояние Lulio |
| --- | --- |
| Адаптация рекомендованного окна к истории ребёнка | Нет: история используется для последнего пробуждения, рекомендация берётся из возрастной таблицы |
| Прогноз времени следующего сна | Нет отдельной модели прогноза |
| План оставшегося дня и ухода в ночь | Нет |
| Настройки количества дневных снов и целевого ночного сна | Нет |
| Отдельный этап подготовки/укладывания | Нет |
| Заблаговременное уведомление о подготовке | Нет |
| Пользовательские разовые и повторяющиеся напоминания | Нет |
| Оценка предполагаемой продолжительности сна | Нет |
| Предупреждение о забытом таймере сна | Нет |
| Пауза сна и отдельный трекер ночных пробуждений | Нет |
| Аналитика времени подъёма/засыпания и ночных пробуждений | Нет |

В существующем расчёте ночь для подсказок жёстко задана как 20:00–08:00. Это не индивидуальная настройка режима.

Android-уведомления показывают хронометр, а не запускают напоминание по будущему времени. iPhone PWA не реализует уведомления или фоновый обмен. Эти ограничения зафиксированы и в README.md.

### 4.3. Остальные различия

| Направление | Различие |
| --- | --- |
| Рост и вес | Есть измерения и прибавки, нет сравнения со стандартами ВОЗ |
| Развивающие занятия | Есть описания навыков, нет ежедневной программы и чеклиста |
| Достижения | Нет отдельного дневника памятных событий |
| Настроение | Нет отдельного трекера |
| Скачки | Статический календарь от ПДР, без адаптации по дневнику |
| Обучающие материалы | Нет встроенной библиотеки по сну, ритуалам и уходу |
| Семейный доступ | Обмен есть, но подключение технически сложнее приглашения партнёра |
| Беременность | Нет отдельного режима |
| Apple Watch | Нет поддержки |

Lulio считает сон по календарным дням и делит средние на весь выбранный период, включая дни без записей. Оригинал описывает другую методику. Это различие определений, а не установленная ошибка Lulio.

### 4.4. Основания в коде

- `src/app/core/services/wake-window.service.ts` — возрастная норма, последнее пробуждение, статусы и фиксированный ночной интервал.
- `src/app/core/constants/wake-norms.const.ts` — возрастная таблица.
- `src/app/shared/components/live-status-banner/live-status-banner.component.ts` — отображение подсказки внутри приложения.
- `src/app/core/services/timer-notification.service.ts` — передача текущих таймеров Android-плагину.
- `plugins/timer-notification/android/src/main/java/ru/babytracker/timernotification/TimerNotificationPlugin.java` — тихий канал и хронометр, без планировщика будущих напоминаний.
- `src/app/core/models/tracker.models.ts` — текущие события, профиль и активные таймеры; нет отдельного этапа подготовки.
- `src/app/core/services/active-timer.service.ts` — начало, завершение и отмена сна, без паузы сна.
- `src/app/features/stats/stats.page.html` — доступные показатели статистики.
- `src/app/core/services/leaps.service.ts` — расчёт календаря от ПДР.
- `SPEC.md`, разделы 6.11–6.12 — границы существующей семейной синхронизации.

### 4.5. Выполненная проверка

Существующий `WakeWindowService` транспилирован и выполнен в изолированном окружении с подменёнными зависимостями Signals/storage/clock. Использовались только синтетические данные; файлы и пользовательский дневник не изменялись.

Наблюдалось:

- без завершённого сна длительность бодрствования и статус неизвестны;
- при 90 минутах бодрствования и возрастном ориентире 80–110 минут статус — `approaching`;
- добавление другой истории за предыдущие 14 дней не меняет рекомендацию при том же последнем пробуждении;
- в 20:30 статус-подсказка равен `null`.

Это smoke-проверка расчёта, не проверка интерфейса, нативных уведомлений или доставки на устройства. Новая система ниже не реализована и не проверена выполнением.

## 5. Проект помощника сна

Все решения этого раздела — предложение для реализации, кроме отдельно отмеченного выбора платформ.

### 5.1. Продуктовый контракт

Помощник отвечает на три вопроса:

1. Когда ориентировочно следующий сон?
2. Когда начать спокойную подготовку?
3. Получу ли я напоминание, если приложение закрыто?

Один и тот же прогноз используется в карточке и в напоминании. Отдельный расчёт для уведомлений недопустим.

Прогноз — ориентир, а не команда уложить ребёнка и не диагноз переутомления. Он не заменяет наблюдение за ребёнком. Не показываем «точность 95%» без отдельной проверки модели.

### 5.2. Индивидуальный режим

Настройки ребёнка:

- часовой пояс режима, явно выбранный и не меняющийся молча при поездке;
- желаемый диапазон начала ночного сна, в том числе переходящий через полночь;
- текущее количество дневных снов;
- длительность подготовки отдельно для дневного и ночного сна;
- включение помощника.

Дату рождения используем для возрастного ориентира. ПДР не переиспользуем скрыто: сейчас она относится к календарю скачков. Вопрос коррекции возраста недоношенных детей требует отдельного обоснования.

Количество дневных снов — ориентир режима, не ограничитель: после необычного дня приложение не должно запрещать дополнительный сон или требовать выдержать окно.

Длительность подготовки сначала задаёт родитель. Можно предложить редактируемые значения 10 минут днём и 20 минут вечером; это настройки продукта, не медицинское назначение.

Настройки устройства: разрешение уведомлений, звук/вибрация, участие этого телефона в получении напоминаний. Они не должны автоматически копироваться партнёру.

### 5.3. Состояния и действия

- **Нет точки отсчёта:** просим указать последнее пробуждение; не выдумываем его из полуночи.
- **Бодрствует:** показываем прогноз и время подготовки.
- **Готовимся:** родитель нажал «Начать подготовку»; сон ещё не начался.
- **Спит:** запускается существующий таймер сна, напоминание отменяется.
- **Прогноз устарел:** расчётное время прошло; просим уточнить состояние, не переносим сон бесконечно вперёд от текущих часов.

Действия карточки: «Начать подготовку», «Уснул», «Уточнить пробуждение», «Не напоминать об этом сне».

Подготовка и сон — разные факты. Начало ритуала не запускает таймер сна. Пара «начал подготовку → уснул» позволяет в дальнейшем оценивать фактическую длительность подготовки. Если начало подготовки не отмечено, такой длительности нет.

### 5.4. Входные данные и качество истории

Для расчёта нужны последнее подтверждённое пробуждение, текущий таймер, возраст, режим и завершённые сны.

Предлагаемая история для адаптации — последние 14 дней. Отдельно рассматриваем дневные окна и последнее окно перед ночным сном. При достаточном количестве записей различаем порядковый номер дневного сна.

Недостаток данных нельзя подменять медицинским выводом. Промежуток между двумя снами может означать пропущенную запись. В персональные образцы включаем только подтверждённо полные интервалы; нужен простой способ отметить день/интервал как неполный. До этого используем возрастной ориентир с соответствующей подписью.

Не используем для обучения незавершённые, будущие, перекрывающиеся или отмеченные родителем как ошибочные интервалы. Не удаляем исходные записи. Короткий сон сам по себе не ошибка. Отклонение от возрастной таблицы тоже не доказательство ошибки.

### 5.5. Прозрачный алгоритм вместо ML

Начальный вариант расчёта, требующий проверки на реальной истории:

1. При недостатке подтверждённых сопоставимых окон используем середину возрастного диапазона; диапазон показываем отдельно.
2. При наличии минимум пяти образцов используем медиану сопоставимых окон и плавно смешиваем её с возрастным ориентиром.
3. Предлагаемый вес истории: `min(0.8, n / (n + 5))`, где `n` — число пригодных образцов. Пять образцов и коэффициенты — инженерные гипотезы, не установленные правила оригинала.
4. Время следующего сна = последнее пробуждение + оценённое окно бодрствования.
5. Время подготовки = время следующего сна − выбранная длительность подготовки.

Возрастную таблицу нельзя считать проверенной медицинской моделью только потому, что она уже есть в коде. Перед выпуском нового помощника нужны источники и проверка применимости ориентиров по возрастам.

Для ближайшего дневного сна используем дневную выборку. Для ухода в ночь — отдельную вечернюю выборку и заданный ночной диапазон. Если результат конфликтует с целевым временем ночи, показываем конфликт, а не рекомендуем держать уставшего ребёнка бодрствующим ради графика. Дополнительный сон остаётся решением родителя.

Полный план дня можно показывать как предварительный: последующие сны зависят от ещё неизвестной длительности ближайшего. Автоматическое напоминание планируется только для ближайшего актуального сна. После фактического пробуждения весь оставшийся план пересчитывается.

Не добавляем непрозрачные поправки «короткий сон = минус 20 минут», болезнь, зубы или скачки без данных и обоснования.

### 5.6. Представление прогноза

Карточка содержит:

- ближайший дневной или ночной сон;
- ориентировочное время и диапазон, а не обещание минуты засыпания;
- время начала подготовки;
- источник: «По возрастному ориентиру» или «С учётом N похожих окон за 14 дней»;
- причину последнего пересчёта;
- состояние доставки: «Запланировано на этом Android», «Сервер подтвердил напоминание», «Ожидает сети» либо «Уведомления недоступны».

План не пересчитывается каждую секунду. Часы меняют обратный отсчёт и состояние просрочки; события, исправления и настройки меняют сам прогноз.

События пересчёта: начало/конец/отмена сна, ручное уточнение пробуждения, исправление/удаление записи, изменение режима, импорт и получение семейных изменений. Пересчёт после возврата в приложение проверяет актуальность времени и доставки.

## 6. Напоминания и доставка

### 6.1. Согласованный выбор платформ

**Android APK + iPhone PWA.**

Предлагаемая архитектура:

- общий локальный расчёт прогноза;
- Android — планирование локального уведомления средствами ОС;
- iPhone PWA — серверная очередь и Web Push для установленного приложения при поддержке платформой и выданном разрешении;
- сервер не обязан получать историю ребёнка: достаточно минимальных данных для напоминания;
- прогноз, дневник и карточка работают без сети независимо от сервера напоминаний.

Это архитектурное решение, не проверенная интеграция. Конкретные API, ограничения версий ОС, разрешения, режимы энергосбережения и взаимодействие service worker нужно подтвердить по актуальной документации и на реальных устройствах до реализации доставки.

«Своевременное» не означает гарантированное до секунды. Система, сеть, режим фокуса и выключенное устройство могут задержать или не показать уведомление. Интерфейс не должен обещать гарантированную доставку.

### 6.2. Семантика одного напоминания

По умолчанию одно автоматическое напоминание о подготовке на один цикл бодрствования на каждом включённом устройстве. Повторный сигнал «теперь срочно укладывайте» не нужен.

Идентификатор логического напоминания стабилен в пределах цикла. Версия прогноза меняет время ожидающего напоминания, но не создаёт новое право уведомить после уже отправленного сигнала.

- Изменение будущего прогноза заменяет ожидающее напоминание.
- Начало подготовки, начало сна, отключение помощника или пропуск напоминания отменяют ожидающий сигнал.
- Отмена сна пересчитывает состояние по последним подтверждённым данным, не создаёт ложного нового пробуждения.
- Если время подготовки уже прошло, показываем карточку; не рассылаем пачку догоняющих уведомлений.
- Уведомление содержит «Скоро сон. Можно начинать спокойную подготовку» и открывает актуальную карточку.
- Нажатие старого уведомления никогда не запускает таймер и не меняет состояние ребёнка.

Не обещаем exactly-once доставку внешним push-транспортом. На своём сервере предотвращаем повторную постановку и используем стабильный идентификатор уведомления на клиенте.

### 6.3. Серверная очередь для PWA

Минимальная запись: область пользователя/семьи, устройство-получатель, идентификатор цикла, версия плана, время отправки UTC, срок актуальности и состояние отмены. Push-подписка хранится отдельно и защищённо.

Предлагаемая схема обмена:

1. Клиент сначала сохраняет изменение локально.
2. Обновляет или отменяет серверное напоминание с ключом идемпотентности.
3. Сервер подтверждает принятую версию; до подтверждения интерфейс показывает «Ожидает сети».
4. В момент отправки обработчик повторно проверяет текущую версию, отмену и срок актуальности.
5. Просроченные напоминания не отправляются; временные ошибки повторяются только до срока актуальности.

Нужны аутентификация устройства, проверка членства в семье, ограничения частоты запросов и возможность отозвать устройство. Одного знания UUID семьи недостаточно для новой публичной очереди. Нельзя принимать произвольные push-получатели от неавторизованного клиента.

Срок актуальности короткий и явно ограничен: исходное предложение — до 10 минут после времени подготовки, но не позже расчётного начала сна. Конкретное значение требует проверки поведения на устройствах. Ограниченный TTL уменьшает риск старого уведомления, но не гарантирует отмену уже отправленного push.

### 6.4. Ограничения офлайна

Android может показать ранее запланированное локальное уведомление без сети, с учётом ограничений ОС. Обновить его можно локально после записи нового события.

Закрытая PWA не должна полагаться на JavaScript-таймер, периодический фоновый запуск или WebSocket. Офлайн-изменение не может отменить напоминание, уже известное серверу, пока клиент не свяжется с ним.

Следствие: если ребёнок уснул офлайн, сервер может отправить устаревшее напоминание. Короткий срок актуальности и проверка версии уменьшают риск, но не устраняют его. Это ограничение должно быть описано в интерфейсе и справке, а не скрыто обещанием «никогда не уведомлять во сне».

### 6.5. Семья и два телефона

Существующий профиль ребёнка не синхронизируется, поэтому нельзя считать, что настройки режима уже общие.

Предлагаемое разделение:

- общий режим и этап подготовки — семейные данные;
- разрешения, push-подписки и включение доставки — данные устройства;
- прогноз — производный результат, не ещё один независимо редактируемый дневник.

Доставка напоминаний не должна незаметно включать облачную синхронизацию всей истории или становиться вторым транспортом дневника. При работе с Яндекс Диском отправляются только данные очереди напоминаний после отдельного согласия, а обмен событиями остаётся ручным.

Два телефона могут получать уведомления, если это включено на обоих. Это ожидаемое поведение, не дубль на одном устройстве. Если нужен только один получатель, второй отключает доставку.

Без обмена свежими событиями телефоны могут иметь разные прогнозы. Ручной Яндекс-обмен не позволяет гарантировать мгновенную отмену у партнёра. Для действительно единого семейного плана нужны своевременная синхронизация исходных данных и общий режим; сервер напоминаний сам по себе этого не обеспечивает.

Конкурирующие обновления очереди разрешаются серверной версией/условной записью, а не сравнением часов устройств. Конфликт возвращается клиенту для сверки, а не молча перезаписывается старым планом.

### 6.6. Приватность

- Отдельное явное включение облачных напоминаний.
- По умолчанию в push нет имени ребёнка, даты рождения, истории сна и медицинских сведений.
- Передаём минимум для доставки; даже время напоминания и push-подписка считаются чувствительными данными.
- Никаких секретов сервера или ключей подписи push в клиентской сборке, дневнике, резервной копии или логах.
- Отключение уведомлений отменяет очередь и позволяет удалить подписку; отзыв доступа удаляет право устройства получать семейные сигналы.
- Выбор хостинга, региона хранения, стоимости и сроков удаления данных нужен до развёртывания. Доступность из российских сетей проверяется отдельно.

## 7. Изменения контрактов при будущей реализации

Предлагаемые сущности:

| Сущность | Назначение | Хранение |
| --- | --- | --- |
| SleepRoutine | Часовой пояс, ночной диапазон, дневные сны, длительности подготовки | Локально; в семейном режиме синхронизируется |
| PreparationSession | Факт начала подготовки и связь с последующим сном | Локально; семейная репликация при включении |
| HistoryCompleteness | Отметки полноты интервала/дня для персонализации | Вместе с исходной историей |
| SleepForecast | Ближайший сон, подготовка, источник, образцы, версия входных данных | Производное вычисление, необязательный кеш |
| ReminderIntent | Логическое напоминание, цикл, версия, срок актуальности | Устойчивое локальное состояние и минимальная серверная очередь |
| DeviceReminderSettings | Разрешения и выбор получения на этом устройстве | Только на устройстве/в защищённом реестре подписок |

Расчёт — чистая функция от входных данных и явно переданного времени. Отдельный координатор согласует карточку и доставку. Существующий плагин хронометра остаётся для текущих таймеров: будущие сигналы подготовки имеют другой жизненный цикл и отдельные настройки канала.

Новые поля требуют миграции хранилища и JSON-резервирования. Старые корректные копии должны импортироваться с выключенными новыми напоминаниями до согласия пользователя; уже существующий дневник не теряется. Push-подписки и права устройств в резервную копию не попадают.

Импорт, смена семьи и отключение помощника отменяют ожидающие напоминания прежней области. Поздние сетевые ответы старой области игнорируются.

## 8. Критерии приёмки будущей реализации

1. Без истории нет выдуманного пробуждения; возрастной ориентир явно отделён от персонального прогноза.
2. При одинаковых исходных данных расчёт детерминирован; текущее время не заставляет будущий сон бесконечно сдвигаться.
3. Подтверждённая история меняет прогноз объяснимо; неполные и конфликтующие записи не превращаются в ложные длинные окна.
4. Начало подготовки не запускает сон; начало сна отменяет ожидающий сигнал на устройстве, а на сервере — после успешной передачи отмены.
5. Исправление и удаление записи, импорт и изменение режима обновляют прогноз и очередь.
6. Повтор запроса и перезапуск не создают повторных сигналов одного цикла на одном устройстве.
7. В Android проверены закрытое приложение, офлайн, перезагрузка устройства, отказ в разрешении и энергосбережение.
8. На физическом iPhone проверены установленная PWA, запрос разрешения по действию пользователя, закрытое приложение, фокус, офлайн, задержанный push и отзыв подписки.
9. Неактуальное уведомление открывает текущее состояние без изменения дневника.
10. Переход через полночь, смена часового пояса и сезонного времени не дают отрицательных интервалов или двойной постановки.
11. Проверены два родителя: одновременные изменения, отставшая история, отключение одного получателя, отзыв устройства и ручная передача через Яндекс Диск.
12. Задержанная отмена и недоступная сеть отражены честным состоянием; интерфейс не выдаёт «запланировано» за подтверждение доставки.
13. Минимальные данные очереди защищены от доступа другой семьи; подмена получателя и повтор старой версии отклоняются.
14. Старые резервные копии и существующие таймеры продолжают работать после миграции; новые уведомления без согласия не включаются.

## 9. Приоритеты и границы

Первый приоритет — законченная цепочка режима, объяснимого прогноза, отдельной подготовки и уведомления на выбранных платформах. Не заменять её пушем, привязанным только к старой возрастной надписи.

Следующий приоритет — ночные пробуждения, аналитика подъёма/засыпания и контроль забытого таймера. Затем — ВОЗ-графики, достижения, развивающие занятия, библиотека и упрощение семейного подключения.

В текущей работе не выбирался облачный провайдер, не создавались сервер, push-подписки, новые события или UI; не менялись зависимости и не выполнялось развёртывание. Перед реализацией нужны подтверждение актуальных платформенных API, проверка возрастных ориентиров и выбор инфраструктуры с условиями хранения/стоимости. Реальную точность прогноза следует оценивать по будущим наблюдениям, не по совпадению с теми же данными, на которых он рассчитан.

## 10. Утверждённый поэтапный план реализации

План утверждён пользователем 23 октября 2026 года. Выполнение — **последовательно, каждый этап в отдельной сессии**. Следующий этап запускается только после проверки результата предыдущего. На момент утверждения этапы не выполнены.

### Этап 0. Проверка предпосылок

**Задачи:** подтвердить источники и применимость возрастных ориентиров; проверить актуальные возможности локальных уведомлений Android и Web Push установленной iPhone PWA; определить поддерживаемые версии, разрешения, ограничения ОС и service worker. Выбрать серверную инфраструктуру с учётом аутентификации, региона хранения, удаления данных, доступности и стоимости. Создание платных ресурсов и публикация требуют предусмотренных согласований.

**Результат:** подтверждённые технические предпосылки, ограничения и выбранная инфраструктура.

**Приёмка:** источники ориентиров и платформенных требований зафиксированы; определены способы проверки доставки и необходимые устройства; инфраструктурные решения согласованы. Неподтверждённые предпосылки не объявляются выполненными. Нельзя молча исключить iPhone или заменить персонализацию старым возрастным индикатором.

#### Stage 0 investigation record — 23 October 2026

**Current status — 24 October 2026: stage 0 accepted for local stage-1 contracts after the independent review in 0.7 and the explicit decisions in 0.6.** Earlier approval-blocked statements below are historical and superseded only as specified in 0.6–0.7; they remain evidence of unresolved delivery/operational risks, not current barriers to local development. The approved Android APK + iPhone PWA scope and stages 1–6 remain unchanged. No implementation, dependency change, deployment or paid resource creation occurred; this session does not start stage 1.

##### 0.1. Age-reference applicability

Local evidence: `src/app/core/constants/wake-norms.const.ts:11–22` contains a disclaimer but no source citation. Its wake-window ranges are 40–60, 50–75, 60–80, 80–110, 105–135, 120–150, 150–180, 180–240 and 210–300 minutes, respectively, across its nine age bands. These numbers are existing product inputs, not validated clinical findings. The final band has no upper age bound; applying a toddler range to every child older than one year is not justified. Boundaries use fixed numbers of days, not calendar-month birthdays.

Authoritative medical sources were read after the coordinator relayed explicit network approval:

- [M1 — AASM consensus, 2016, endorsed by AAP](https://aasm.org/resources/pdf/pediatricsleepdurationconsensus.pdf): **12–16 hours/24 hours including naps at 4–12 months; 11–14 at 1–2 years; 10–13 at 3–5 years**. Under-four-month recommendations are explicitly omitted because of wide normal variation and insufficient outcome evidence. No wake-window minutes are prescribed.
- [M2 — WHO under-five guidance, 2019](https://www.who.int/news/item/24-04-2019-to-grow-up-healthy-children-need-to-sit-less-and-play-more): **14–17 hours at 0–3 months, 12–16 at 4–11 months, 11–14 at 1–2 years, 10–13 at 3–4 years**, including naps. Daily-duration context is not minute-level forecast validation.
- [M3 — NHS baby sleep guidance, reviewed January 2025](https://www.nhs.uk/baby/caring-for-a-newborn/helping-your-baby-to-sleep/): individual variability, feeding-related waking, changing patterns and soothing routines; no universal nine-band wake-window table or required nap count.
- [M4 — AAP corrected age](https://www.healthychildren.org/English/ages-stages/baby/preemie/Pages/Corrected-Age-For-Preemies.aspx): for developmental milestones during the first two years, corrected weeks = chronological weeks minus `(40 − gestational weeks at birth)`. This is **not** validation of corrected-age sleep predictions. The text reader omitted the body; the public raw article body was successfully retrieved and read.

**Confirmed limits:** the existing table switches daily sleep to 12–16 hours at day 91, before the four-calendar-month boundary in M1/M2, and its indefinite “older than one year” band fails to change for older children. `WakeWindowService:13–23` uses chronological calendar-day age from birth, not corrected age. Fixed day counts are not exact calendar-month guideline boundaries.

Daily total sleep and an individual wake interval are different quantities. Agreement with M1/M2 does not validate wake minutes, nap count, preparation duration, adaptation coefficients or prediction accuracy. No reviewed authoritative source validates the table's nine wake-minute ranges; this does not establish that no relevant research exists.

**Proposed product decision, requiring approval before stage 2:** retain those ranges only as explicitly labeled non-clinical engineering priors, with parent-entered routine and observable tiredness taking precedence; source displayed daily totals separately to M1/M2 using calendar-age boundaries and define an upper supported age. Newborn guidance must not imply feeding restriction or a required schedule. If clinically validated wake-minute priors are required instead, obtain a suitable validated source/qualified review: current evidence does not meet that stronger requirement. Do not replace personalization with the old indicator or claim clinical validation. No table or algorithm changed here.

**Prematurity:** do not silently reuse EDD, infer gestational age or apply M4's milestone formula to sleep. Explicitly disclose lack of validated generic sleep priors for this case; a parent/clinician-approved routine is preferable to invented correction. The age range and prematurity behavior remain approval-dependent applicability decisions, not diagnoses or permission to drop scope.

##### 0.2. Android APK: capabilities and a concrete incompatibility

Official sources:

- [A1 — Capacitor v8 Local Notifications](https://capacitorjs.com/docs/apis/local-notifications): local OS scheduling, permissions, exact-alarm settings, Doze and Android Private Space.
- [A2 — Android alarm scheduling](https://developer.android.com/develop/background-work/services/alarms): exact/inexact timing, special app access, revocation and rescheduling.
- [A3 — Android notification runtime permission](https://developer.android.com/develop/ui/compose/notifications/notification-permission): `POST_NOTIFICATIONS` on API 33+; new installations start with notifications disabled.
- [A4 — Android 15 behavior changes](https://developer.android.com/about/versions/15/behavior-changes-all): force-stop cancels pending intents; locked Private Space stops applications and notifications.

Local evidence:

- `android/variables.gradle:2–4`: minimum API 24 (Android 7), compile/target API 36 (Android 16). This is configured compatibility, not a tested device matrix.
- Installed `node_modules/@capacitor/local-notifications/package.json:3`: **8.3.1**, not an assumed older v8 API. Its public `dist/esm/definitions.d.ts` exposes `schedule`, `update`, `cancel`, `getPending`, channel APIs, permission checks/settings, `isExactNotification`, `isExactMandatory` and `schedule.allowWhileIdle`.
- The dependency's own `android/src/main/AndroidManifest.xml:26–29` contributes `RECEIVE_BOOT_COMPLETED`, `WAKE_LOCK`, `POST_NOTIFICATIONS` and `SCHEDULE_EXACT_ALARM`. The app manifest alone lists only Internet; its absence there does **not** prove absence from the merged APK. No merged-APK inspection was performed.
- `plugins/timer-notification/.../TimerNotificationPlugin.java:33–50,125–145` uses the separate low-importance, silent `baby-tracker-live-timers` channel and stopwatch display. Keep its behavior unchanged; preparation reminders need a distinct channel and identifier namespace.

**Proposed permission/timing policy:** request notification permission only after an explicit enable action; explain exact-alarm special access separately on API 31+. Prefer user-granted `SCHEDULE_EXACT_ALARM`, not automatically granted `USE_EXACT_ALARM`; do not assume this product qualifies for the latter's restricted use cases. Query permissions and channel state after resume/restart and after changes. With exact access, a one-shot wall-clock alarm and `allowWhileIdle` can run while the process is absent and offline, subject to OS limits. Capacitor documents at most one allow-while-idle firing per nine minutes per application. Do not bypass DND, battery policy or Private Space.

Without exact access, do not label an inexact fallback “scheduled precisely”: Android documents possible delays of up to an hour on API 31+, and additional power-saving limitations. Keep the in-app forecast available with an explicit degraded/unavailable reminder state. A real-device check must establish whether approximate delivery is useful; it cannot silently replace the acceptance contract.

**Version-specific trap:** 8.3.1 `schedule()` may request both notification permission and exact-alarm settings; `isExactNotification` defaults to true. It can return an inexact-warning fallback; `isExactMandatory` rejects that fallback on `schedule()`, but **not** on `update()`. `update()` ignores unknown IDs and silently falls back to inexact alarms. Call success is therefore neither proof of an existing pending reminder nor proof of requested timing. Evidence: public declarations `:65–84,273–280,880–911` and installed `LocalNotificationsPlugin.kt:105–183`.

**Confirmed source-level blocker to using the stock plugin unchanged:** installed `LocalNotificationRestoreReceiver.kt:42–48` moves an overdue one-shot to **15 seconds after reboot**; `TimedNotificationPublisher.kt:21–42` posts without an expiry or forecast-version check. That contradicts section 6.2's no-catch-up rule and permits a stale preparation signal while JavaScript is closed. A foreground cancellation after reopening does not fix delivery before reopening.

**Proposed stage-4 resolution, not implemented:** a first-party native reminder scheduler/receiver in project-owned plugin code, distinct from the live-timer display, with persisted cycle/version/expiry/cancellation/sent state. Recheck those fields atomically before native publication, restore only still-current future alarms after boot, and never revive expired work. Reuse platform permission/channel mechanisms rather than editing `node_modules` or generated Android code. The installed plugin is API evidence, **not** an accepted complete delivery solution. This requirement must be proved with an overdue reboot and delayed-alarm scenario before Android acceptance.

“Closed” must distinguish ordinary process death/task dismissal from user **Force stop**: Android 15 explicitly cancels pending intents in the stopped state [A4]. No guarantee is made while force-stopped, powered off, permissions denied, channel blocked or Private Space locked. Returning to the app reconciles only valid future work, not a backlog.

##### 0.3. iPhone installed PWA and existing service worker

Official sources:

- [W1 — WebKit: Web Push for Home Screen web apps](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/): iOS/iPadOS **16.4+**, Home Screen installation, direct user gesture, Focus and manifest identity.
- [W2 — WebKit: Meet Web Push](https://webkit.org/blog/12945/meet-web-push/): Push API + Notifications API + service worker; user-visible notifications are mandatory, not silent background execution.
- [W3 — Apple: Sending Web Push](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers): VAPID, encrypted payloads, TLS/SNI, endpoint registration, TTL, response codes and 4 KB payload limit.

Minimum **Web Push transport** requirement is iOS 16.4+ [W1,W3], but the **application's existing supported baseline is iOS/Safari 17+**, evidenced by `.browserslistrc:11–15` and `README.md:21`. Do not advertise app support on 16.4 just because push exists there. Require an installed Home Screen web app, secure HTTPS origin, active worker, supported APIs and granted permission. A normal Safari tab is not a substitute. Use capability detection and installation guidance. No Apple Developer Program membership or native APNs entitlement is needed [W1,W3].

Ask from the enable button's gesture handler, not after a deferred network login that may lose user activation. Authenticate/preflight first, then provide the explicit subscription action. Store the resulting endpoint and encryption keys only in the authorized device's server record. Keep the VAPID private key server-side; the public application-server key is the only VAPID material needed by the client. Permit outbound HTTPS to `*.push.apple.com`; do not replace Web Push with the older Safari certificate-based push system.

Local integration evidence:

- `src/main.ts:13–16` already registers **one** `ngsw-worker.js` immediately in production web mode and disables it for native Capacitor.
- `ngsw-config.json:4–16` prefetches the application shell, uses performance navigation and has no API data cache. `src/manifest.webmanifest:2–9` already has stable `id`, root scope/start URL and `display: standalone`.
- Installed `@angular/service-worker/types/service-worker.d.ts:245–405` documents `SwPush.requestSubscription({serverPublicKey})`, subscription state/change events, click events and unsubscribe.
- Installed `@angular/service-worker/ngsw-worker.js:1700–1754` already handles `push`, renders a payload's `notification.title`, and handles `notification.data.onActionClick.default` including `navigateLastFocusedOrOpen`. A payload without title produces no visible notification; that is incompatible with Apple's visible-push requirement.

**Proposed integration:** reuse that registration and `SwPush`/its underlying `PushSubscription`; do not install a competing root-scope worker or overwrite generated `ngsw-worker.js`. Use one visible generic notification, a stable cycle tag, and a fixed same-origin current-card route through `navigateLastFocusedOrOpen`. The route reads current local state; it never executes a sleep/preparation action from payload data. API-origin adapters must preserve the repository's Signals-only application state rather than introducing a second reactive-state convention.

The stock worker does **not** compare a reminder's expiry, cancellation or forecast version before displaying it. Put freshness checks immediately before server submission and set transport `TTL` to the positive remaining lifetime, bounded by `min(preparationAt + 10 minutes, predictedSleepAt) - now` (the ten-minute value remains a product hypothesis). Never send when this is nonpositive. TTL limits push-service storage, not a guarantee of display time or retraction. An already accepted push can race with cancellation; Focus can defer presentation. Do not send invisible “cancel” or diary-sync pushes: Apple says invisible delivery can revoke permission [W2,W3].

Recover subscription state on resume, handle permission denial/revocation/rotation, retire a subscription on HTTP 410, and distinguish permanent configuration/authentication errors from bounded 429/5xx retries. Apple's HTTP 201 means push-service acceptance, **not** displayed/read confirmation. Suppress expired work server-side; do not claim that a JavaScript timer, background fetch or WebSocket schedules a closed iPhone PWA.

Worker acceptance must include an old installed version receiving a compatible payload, offline shell navigation after a click, a deployed shell update and a later push using the same registration. Existing caching/update behavior must survive; no app/worker migration was exercised in this investigation.

##### 0.4. Infrastructure alternatives and subsequent user decision

**Selected by the user:** Android APK + iPhone PWA; subsequently **Yandex Cloud Functions without paid subscription plans or Lockbox**. The Functions-only clarification below supersedes the earlier YDB/Lockbox recommendation, which is retained as research rather than an approved deployment design. Durable reminder storage, billing ceiling and retention/enrollment policy remain unresolved. Preserve the existing Russian-hosted PWA origin.

| Option | Public conditions verified on 23 October 2026 | Recommendation |
| --- | --- | --- |
| Yandex Functions + YDB Serverless, `ru-central1` | Monthly free allowances: 1 million function calls, 10 GB-hours, 1 million DB RU and 1 GB-month DB storage; PAYG beyond allowances | Preferred low-volume candidate; no always-on VM, paid domain or gateway required |
| Yandex Message Queue, standard | First 100,000 requests/month free, then **57.82 RUB/million**; each 64 KB chunk counts; trigger consumer requests are free | Optional dispatch isolation, not calendar storage: delayed delivery is limited to 15 minutes |
| Supabase Pro, specific Frankfurt `eu-central-1` | **US$25/month** for one Micro-covered project before taxes/overages; seven-day daily backups/logs | Managed Postgres/Auth alternative, not selected; fixed foreign spend/processing does not match existing preferences |
| Supabase Free | US$0, 500 MB DB, 500,000 function calls/month; may pause after an inactive week | Synthetic development only, not dependable unattended production |
| Hetzner Cloud, Germany/Finland | Public entry **EUR5.99/month excluding VAT**; stock/IP/backups extra | Not selected; requires owner-operated authentication, patching, TLS, DB and backups |

Yandex sources: [Y1 — Functions RUB prices](https://yandex.cloud/ru/docs/functions/pricing), [Y2 — complete YDB RUB price table](https://docs.yandex.cloud/ru/ru/ydb/pricing/serverless.md), [Y3 — complete Queue RUB price table](https://docs.yandex.cloud/ru/ru/message-queue/pricing.md), [Y4 — free-tier scope](https://yandex.cloud/en/docs/billing/concepts/serverless-free-tier), [Y5 — UTC timer cron](https://yandex.cloud/en/docs/functions/concepts/trigger/timer), [Y6 — delay limits](https://yandex.cloud/en/docs/message-queue/concepts/delay-queues), [Y7 — queue-trigger semantics](https://yandex.cloud/en/docs/functions/concepts/trigger/ymq-trigger), [Y8 — regions](https://yandex.cloud/en/docs/overview/concepts/region), [Y9 — budget is not cutoff](https://yandex.cloud/en/docs/billing/concepts/budget), [Y10 — direct HTTPS functions](https://yandex.cloud/en/docs/functions/concepts/function-invoke), [Y11 — Lockbox RUB prices](https://yandex.cloud/ru/docs/lockbox/pricing).

Alternative sources read: [H1 — Supabase prices](https://supabase.com/pricing), [H2 — regions](https://supabase.com/docs/guides/platform/regions), [H3 — Cron](https://supabase.com/docs/guides/cron), [H4 — function limits](https://supabase.com/docs/guides/functions/limits), [H5 — regional invocation](https://supabase.com/docs/guides/functions/regional-invocation), [H6 — backups](https://supabase.com/docs/guides/platform/backups), [H7 — authentication](https://supabase.com/docs/guides/functions/auth), [H8 — production responsibilities](https://supabase.com/docs/guides/deployment/going-into-prod), [H9 — Hetzner](https://www.hetzner.com/cloud/). Prices are observations, not quotations or spending authority. Verified Supabase price is US$25, not “5/month”.

**Preferred concrete architecture (proposal, not approved/provisioned):**

1. Preserve the existing HTTPS PWA/worker. Add a dedicated Russian reminder database and direct HTTPS Cloud Functions endpoint with explicit CORS for that origin and application authentication [Y10]. Do not upload diary/profile or change the chosen diary transport; Android local reminders remain independent.
2. YDB Serverless holds subscriptions separately from minimal intents and authenticated device membership. Only narrowly scoped server service accounts access YDB; clients receive no database/queue credentials. Use indexed due-time buckets, transactional conditional updates, stable cycle/device IDs and leases rather than whole-table scans.
   YDB supports serializable read/write transactions with optimistic conflict detection ([Y12 — official transaction model](https://ydb.tech/docs/en/concepts/transactions)); claim/update conflicts must retry the whole transaction, bounded by intent expiry. Do not assume PostgreSQL `SKIP LOCKED` syntax or stale replica reads provide equivalent checks.
3. One UTC timer (`* * * * ? *`) invokes a bounded dispatcher **once per minute** [Y5]. Claim only due/current/unexpired rows; recheck membership, cancellation and revision immediately before encrypted Web Push submission. The timer has no seconds field: Supabase's possible 30-second cadence does not apply here. Nominal scan wait is up to one minute plus execution/network delays, not a delivery SLA.
4. Initially send bounded batches directly from the dispatcher; persist retry/lease state in YDB. Optional Message Queue separation enqueues only opaque intent IDs/versions into a standard-queue trigger, revalidates against YDB and handles at-least-once processing idempotently [Y7]. Stop retries at expiry. A 15-minute queue delay [Y6] cannot schedule a several-hour wake window; cancellation changes durable intent state, not merely a queued message.
5. Keep VAPID/enrollment-signing secrets server-side in managed secret storage. One proposed active Lockbox version costs **0.0274 RUB/version-hour**, or **19.728 RUB at 720 hours**, plus **3.79 RUB/10,000 get operations** [Y11]. Rotation adds versions/cost; restrict access and account for cold-start reads. No secrets were generated or accessed.

**Cost model, not monthly quote:** [Y1] lists **6.48 RUB/GB-hour** above ten free GB-hours and **18.97 RUB/million function calls** above one million; [Y2] lists **24.64 RUB/million RU** above one million and **0.0342 RUB/GB-hour** above 720 free storage GB-hours. RUB rates include VAT. A hypothetical 256 MB dispatcher taking one billed second every minute for 30 days uses 43,200 calls and **3 GB-hours**; 30,000 additional one-second API/sender calls add **2.0833 GB-hours**, totaling 73,200 calls and about **5.0833 GB-hours**. Functions usage fits the stated allowances **only if not already consumed elsewhere on that billing account** [Y4]. Actual durations, RU/query complexity, retries, logs and secret reads were not measured.

With a hypothetical DB under its free allowances, low egress/log volume, one Lockbox version and 1,000 secret reads, the modeled secret component is about **20.107 RUB/30-day month**; with 43,200 reads it is about **36.101 RUB**. This is not a whole-service fixed-price promise. A 31-day month, shared allowances, abuse, extra versions, exports/restores, storage growth or accidental provisioned YDB capacity change the bill. Quotas, concurrency and request/device limits reduce exposure but **do not create a hard ruble cap**; rejected application requests can still invoke billable code. Budgets notify without stopping consumption [Y9]; alerts or automated shutdown may arrive after spend. If an inviolable 50 RUB total limit is required, this PAYG proposal does not satisfy it.

**Authentication/enrollment proposal:** dedicated opaque installation identity and a cryptographically random high-entropy revocable device credential, issued only by controlled enrollment and stored as a verifier/hash server-side. Authenticate every mutation and derive recipient scope from the credential, never an arbitrary supplied push endpoint. Use owner-approved, single-use hashed pairing invitations (proposed ten-minute expiry), plus operator-authorized one-time initial-owner bootstrap; neither public family UUID claiming nor a shared bundled password. Short-lived access credentials and rotating installation credentials require explicit client-persistence/XSS/recovery review before stage 5. A standard managed alternative is Supabase Auth [H7], but foreign auth processing is not silently enabled for this Russian design.

Existing `supabase/migrations/202610200001_family_sync.sql:9–35` authenticates devices and limits member reads, but `join_tracker_family` admits UUID holders. Do not copy that boundary into the public reminder service. Existing external diary identities need validated issuer/audience/member mapping before being trusted here. Manual Yandex exchange users separately consent to reminder membership; disk credentials are not reused and stale diary histories do not automatically converge.

**Region/data flow:** propose Russia `ru-central1` for Functions, YDB, optional queue, secrets and logs, using Russian endpoints rather than Kazakhstan. Yandex documents regional resource-data isolation [Y8]. Encrypted Web Push nevertheless exits to **Apple's global push infrastructure** and the device; endpoint/IP/timing metadata also leave the Russian application store. Do not claim end-to-end Russia-only processing. Apple's processing/storage jurisdiction and the cross-border legal basis need owner review; encryption/generic content reduce disclosure, not that requirement. Russian carrier/Wi-Fi/API/Apple reachability remains unmeasured.

**Retention/deletion proposal:** no child name, DOB, diary or medical details; only opaque scope/device/cycle, revision, due/expiry, status and protected subscription. Never log bodies/credentials/endpoints. An acknowledged disable/revoke removes receiving rights, cancels future intents and deletes subscription; offline deletion remains pending. Purge terminal job details within 24 hours while retaining minimal live-scope deduplication/revision high-water state until scope deletion. Proposed subscription expiry is 30 days without client contact, requiring visible re-enrollment; approve this availability/retention tradeoff.

YDB advertises **two full automatic backups for the last two days** [Y2,Y4], so active-row deletion is not immediate physical backup erasure. Propose no extra reminder exports and one-day application-log retention; verify provider log/backup erasure terms before publication. Restoration must not revive revoked subscriptions, expired jobs or sent cycles: define reconciliation/quarantine before restoring. No blanket guarantee covers every provider copy or Apple's accepted pushes. Supabase's seven-day backups/logs apply only if that alternative is approved.

**Bundled user decision required:** approve (a) Yandex serverless/Russia and minute-level dispatch cadence, (b) PAYG/no-hard-cap risk with owner-chosen alert/shutdown thresholds, (c) enrollment/recovery, retention and global Apple processing, and (d) the non-clinical age/prematurity policy in 0.1; or select the documented alternatives/require strict cost or clinical-evidence constraints. No cloud-console contents, resource credentials, expenditure or deployment were accessed or authorized.

**Subsequent user decision — 24 October 2026:** use Yandex Cloud Functions, without paid subscription plans. Do not adopt Supabase Pro, a VPS, Lockbox, YDB or Message Queue as approved dependencies. No resource creation, expenditure, secret access or deployment is authorized by this design choice.

Cloud Functions is usage-billed, not an unconditional free service. Aim to fit its free allowances; neither the absence of a subscription nor a budget alert guarantees a zero bill. Actual limits and billing exposure must be presented before deployment.

The preferred next investigation is a minimal Functions-based architecture, with VAPID material supplied only through protected server-side configuration if its access controls and operational handling are verified. Never embed a private key in the PWA, source, public object, diary, backup or logs. A function's memory and temporary files cannot be the durable reminder queue: instances may be replaced or scaled independently ([official runtime overview](https://yandex.cloud/ru/docs/functions/concepts/runtime/), [environment and temporary storage](https://yandex.cloud/ru/docs/functions/concepts/runtime/environment-variables)).

Functions-only compute does not remove the need for persistent subscriptions, cancellation/version state and due times while the PWA is closed. Investigate whether existing Object Storage can safely provide that minimal state, including conditional writes, concurrency, idempotency, deletion and least-privilege access. This is not yet selected or proven. Never put subscriptions or secrets in the publicly readable PWA bucket; private state requires a separately protected location. Do not quietly add a database, queue, paid secret store or public state as a shortcut. If a secure persistent-state design cannot meet the approved constraints, report that exact prerequisite for a user decision.

The user has not thereby approved the previously proposed age/prematurity policy, retention periods, global push-processing terms or a specific spend threshold. Stage 0 remains open for these decisions and the revised minimal architecture; subsequent implementation stages have not started.

###### 0.4.1. Functions-only clarification: minimal private-state feasibility — 24 October 2026

**Decision status:** Cloud Functions compute, no paid subscription plan and no Lockbox are selected; private Object Storage, its permissions, region, retention and billing exposure are **proposals, not selected resources**. The coordinator explicitly confirmed this distinction during this investigation and requested a single-family design. The earlier YDB/Queue/Lockbox architecture and its cost model above are superseded recommendations, not prerequisites to adopt. Nothing was provisioned.

**Conclusion:** Functions alone cannot durably remember subscriptions, cancellation, revisions or sent cycles while the PWA is closed. Instance suspension/termination and ephemeral `/tmp` are documented in [F1 — function lifecycle](https://yandex.cloud/en/docs/functions/concepts/function) and [F2 — runtime environment](https://yandex.cloud/en/docs/functions/concepts/runtime/environment-variables). A long-running timer, singleton setting or warm instance is not durable storage. The smallest additional candidate is **one separately private Russia-region STANDARD Object Storage bucket and one known opaque family-state object**, plus a Cloud Functions timer and narrowly authorized runtime service account. Object Storage is already the hosting service, but the **public PWA bucket is not this private store**; no suitable existing private bucket or its configuration was inspected. Reusing the old empty bucket also requires explicit repurposing/access approval, not an assumption.

**Provider-specific evidence, read from official public documentation in this session:**

| Reference | Confirmed capability or constraint |
| --- | --- |
| [S1 — PutObject](https://yandex.cloud/en/docs/storage/s3/api-ref/object/upload), [S2 — conditional writes](https://yandex.cloud/en/docs/storage/concepts/object#conditional-writes) | Yandex explicitly supports `If-None-Match: *` creation and `If-Match` current-ETag replacement. Failure can be 404 for missing If-Match target, 412 for failed precondition or 409 for a concurrent write during upload. Plain PUT is last-writer-wins, not a lock. |
| [S3 — storage FAQ](https://yandex.cloud/en/docs/storage/qa#qa-consistency) | Strong consistency for overwritten PUT and deleted DELETE objects. This is not a multi-object transaction or a documented atomic LIST snapshot. |
| [S4 — access control](https://yandex.cloud/en/docs/storage/security/overview) | IAM, bucket policy, public access and object ACL all affect authorization. An obscure key/prefix or CORS is not confidentiality. Restrict public object reads, listing and configuration; avoid public object ACLs and separately check every effective access path. |
| [S5 — S3 authentication](https://yandex.cloud/en/docs/storage/api-ref/authentication#aws-s3-api), [F3 — function service identity](https://yandex.cloud/en/docs/functions/operations/function-sa) | S3 API accepts `Authorization: Bearer` IAM tokens without a static-key signature. An attached function service account can obtain its runtime token through context/metadata. Prefer this over adding stored static cloud credentials; never return/log the token as in the documentation's demonstration. |
| [S6 — DeleteObject](https://yandex.cloud/en/docs/storage/s3/api-ref/object/delete), [S7 — versioning](https://yandex.cloud/en/docs/storage/concepts/versioning) | DELETE supports specific version IDs; version history can preserve old subscriptions. These pages do not establish conditional DELETE parity with AWS. Do not infer it from conditional PUT support. |
| [F4 — Functions roles](https://yandex.cloud/en/docs/functions/security/), [F5 — GetVersion response](https://yandex.cloud/en/docs/functions/functions/api-ref/Function/getVersion) | `functions.editor` and `functions.admin` explicitly read version environment/code. GetVersion includes the environment map. Invocation rights do not justify granting editor/admin or returning configuration. |
| [F6 — adding environment variables](https://yandex.cloud/en/docs/functions/operations/function/environment-variables-add), [F7 — logs](https://yandex.cloud/en/docs/functions/concepts/logs) | Configuration changes create versions; CLI/Terraform examples contain literal values. stdout/stderr and structured JSON fields enter Cloud Logging; request logs are automatic. Secret masking or absence of request-body capture was not demonstrated. |
| [F8 — timer](https://yandex.cloud/en/docs/functions/concepts/trigger/timer), [S8 — RUB storage prices](https://docs.yandex.cloud/ru/ru/storage/pricing.md) | Minute-resolution UTC scheduling; STANDARD free allowances and usage billing below. These are not delivery guarantees or spending caps. |

**Concrete minimal design proposal, not an implemented/proven service:**

1. Keep the current HTTPS PWA origin and Angular worker integration in 0.3 unchanged. One public HTTPS API function authenticates device requests in application code; another, IAM-invoked dispatcher function runs once per minute. Only the dispatcher needs the VAPID private key. Its timer must not be callable merely by forging a timer-shaped public request.
2. Server configuration identifies **one fixed opaque family scope/key**. Each tick GETs that known private aggregate; **no LIST, public discovery, multi-tenant directory or additional index**. The single-family aggregate contains authorized device verifiers, single-use invitation verifiers, protected subscriptions, current intent/version/cancellation, deduplication and attempt state. Store no diary, DOB or child name. Two isolated test scopes can later prove cross-scope rejection; this does not require a production multi-family feature.
3. Put every change affecting recipient authorization and sending in that same object. Initial owner-authorized bootstrap alone may use `If-None-Match: *`; normal updates always GET the object/ETag, validate authenticated membership and expected logical revision, then PUT with `If-Match`. Include a strictly increasing revision/new mutation nonce so restoring identical business fields does not deliberately reuse an earlier representation. On 409/412 re-read and revalidate; reject obsolete client revisions instead of blindly merging them. After timeout with unknown write outcome, GET and reconcile the recorded request ID. A retry of an already-applied mutation returns its recorded outcome, not another enqueue.
4. API updates, cancel/revoke, claims and send authorization compete through the same CAS boundary. Losing senders re-read; a cancellation/revocation committed before the send-authorization CAS prevents authorization. A preparation time already past at submission does not create catch-up work. Every attempt rechecks expiry, cycle, revision and recipient in the latest aggregate immediately before sending; use the bounded TTL in 0.3. Once an external push has been authorized/submitted, a later cancellation can race with it, as already disclosed in 6.4.
5. A pre-send lease has a unique attempt/fencing token and bounded expiry. Reclaim only work that has **not** committed send authorization; an old holder must win a fresh CAS verifying its token before proceeding. Function concurrency limits and a lease alone do not fence an Apple HTTPS request already in flight. Never expire a lease and blindly resend an ambiguously submitted attempt.
6. **Unresolved send tradeoff, not a claim of exactly-once:** a crash between durable send authorization and network submission can miss a signal; a network timeout after submission leaves acceptance unknown. Apple Web Push and object PUT do not form one transaction or provide a shared idempotency key. Recommended conservative policy is no automatic retry of an unknown-outcome attempt; only retry a definitely rejected transient request while current/unexpired, recording the new attempt through CAS. A stable notification tag can replace a displayed notification, not prove no second alert. The duplicate-versus-missed-reminder policy requires explicit approval and crash/timeout evidence before stage-5 acceptance; research does not silently relax criterion 8.6.
7. Limit runtime storage rights to the private bucket/object operations actually needed; use runtime IAM rather than static credentials. Browser clients get neither storage IAM nor signed object URLs. Validate origins/CORS for browser requests, but authenticate every mutation independently of CORS. Bootstrap and expiring pairing/recovery remain the controlled-enrollment proposal in 0.4, not publicly claimable family UUIDs.

**VAPID without Lockbox — feasible only with trusted-operator exposure accepted.** Inject private material into server-side function-version environment through an owner-approved protected configuration channel; it is not a vault and is visible to privileged editors/admins [F4,F5]. Restrict inherited folder/cloud grants as well as function grants; keep public invocation separate from configuration management. The operator must confirm who can read configuration, old versions, deployment exports and logs. Generate/configure keys only during a separately authorized operational step; this worker neither generated nor read them.

Do not copy secrets into code/ZIP/PWA, command arguments or shell history, Terraform/configuration state, CI output/artifacts, exception dumps, HTTP responses, request query strings or event/environment logs. The public CLI examples in F6 are documentation, **not** safe instructions to paste secret values into this terminal. VAPID rotation creates new configuration/version exposure and can require resubscription when the application-server key changes; retire exposed old versions under the release procedure. F5 documents logging disablement; otherwise use redacted status-only application logs and owner-approved short retention. Disabling application logging is not proof that provider audit/request records never exist. Actual IAM grants, deployment handling and automatic-log contents remain uninspected and must be verified with dummy markers in a synthetic scope before any real key/subscription.

**Deletion/non-resurrection proposal:** acknowledge disable/revoke only after CAS removes subscription/enrollment verifiers and cancels outstanding intents. Until that acknowledgement, show pending network state. Normal clients cannot recreate absent state; they may only conditional-update existing state. Keep minimal non-secret revision/deduplication tombstones while a scope is active; remove terminal detail after the proposed 24 hours. Whole-scope deletion CAS-scrubs personal delivery material and marks the scope permanently closed before later physical DELETE, so stale writers cannot recreate it through unconditional PUT. Do not rebootstrap the same scope key. A worker already authorized to submit may still race with deletion; storage deletion cannot retract Apple's accepted push.

Prefer a new never-versioned private state bucket without object lock, replication or reminder exports; otherwise enumerate/delete retained versions and copies under an approved purge procedure [S6,S7]. A bare delete marker or paused versioning is not evidence of historical erasure. Provider-internal physical erasure timelines were not established; do not promise instant removal from every provider copy. Retention of logs/tombstones, no-contact subscription expiry, operator recovery and global Apple processing remain user decisions, as in 0.4. An old export/restore must not reactivate a closed scope; no backup/restore acceptance was exercised.

**Revised single-family cost model — no subscriptions or Lockbox charges assumed:**

| Modeled item, 30 days | Quantity / current public condition |
| --- | --- |
| Minute dispatcher calls | 43,200; at 256 MiB and one billed second, 3 GB-hours; previous Functions free-tier caveats still apply |
| Known-object polling | 43,200 GET, zero LIST; leaves 56,800 of the documented 100,000 free GET/HEAD/OPTIONS before other account/application traffic |
| State mutations | PUT only on enrollment/update/cancel/claim/attempt/status/purge, not on every idle tick; first 10,000 combined PUT/POST/PATCH/LIST free |
| Above-allowance STANDARD operations | 0.5692 RUB/1,000 PUT/POST/PATCH/LIST; 0.46 RUB/10,000 GET/HEAD/OPTIONS; DELETE unbilled [S8] |
| Storage | First 1 GiB STANDARD allowance; published table also expresses free storage as 720 GiB-hours, then 0.0033 RUB/GiB-hour [S8] |

This avoids the rejected one-LIST-per-minute directory scan. Counts were recalculated with a standalone local Node command; they are not cloud measurements. Existing public PWA traffic uses Object Storage too; do not assume a new bucket resets free allowances. Conflicts, retries, permission errors (S8 bills 403/404), extra reads before sending, API calls, logs, egress and a 31-day month increase consumption. Neither service is guaranteed free; the one-GiB prose allowance and 720-GiB-hour table should not be turned into a 31-day zero-cost promise. Current usage, actual execution time and billing account limits were not inspected. No provisioned instances, extra database/queue/secret service, paid plan or hard budget cutoff is assumed.

**Smallest remaining decision and stage boundary:** approve in principle the additional private Russia-region Object Storage state, runtime IAM and trusted-operator environment exposure, with acceptable PAYG/no-hard-cap risk; or supply another approved durable private store. Rejecting all private persistent state makes the closed-iPhone delivery contract infeasible with Functions alone. Approval of a design does not authorize bucket creation, IAM changes, key generation, cloud access, charges or deployment.

Before stage 0 can be accepted and the coordinator can open stage 1, resolve that architecture decision and the already-open age range/non-clinical prior/prematurity and family enrollment/privacy/retention applicability decisions (or explicitly approve a scoped deferral without changing their acceptance criteria). Physical Android/iPhone tests, real network availability, key provisioning, effective cloud permissions/logging, deletion and cost measurements are **later operational/delivery gates**, not requirements to provision infrastructure merely to define stage-1 local data contracts. They remain blockers to later delivery/release acceptance; their absence does not itself make local contracts impossible. No next stage starts in this session.

**Evidence boundary for this clarification:** full existing research and supplied repository rules read; existing PWA/public-bucket configuration checked in `DEPLOY.md:54–65`; official public provider documentation above read; arithmetic executed locally; coordinator decision recorded. Earlier age/platform/package observations and missing-device results in 0.1–0.3/0.5 are preserved, not rerun or reclassified as fresh observations. No authenticated cloud/runtime, actual conditional write, subscription, lease/crash scenario, key injection, ACL, log redaction or deletion was exercised; those are documentation-backed capabilities and design inferences, not successful integration tests. **Reachable research finished; stage-0 acceptance is still blocked, not successful.**



##### 0.5. Evidence actually obtained and outstanding gates

**Performed:** read the complete research and repository rules; inspected the cited local source/public declarations and read authoritative medical, platform and hosting documentation. Executed a standalone arithmetic calculation confirming the cost-example call counts, GB-hours and secret costs; these are modeled inputs, not measured service consumption. Read-only device discovery attempted `adb devices -l` (failed: `adb` command not found) and `xcrun devicectl list devices` (failed: utility unavailable). Orca's tab inventory contained no Lulio runtime; no cloud-console contents or user diary were opened. There is no physical-device delivery, subscription, endpoint-connectivity, latency, region-placement or deletion evidence. No builds/tests were run or claimed: this is documentation-only research.

Required later evidence, with synthetic records and a separate opted-in test scope:

| Surface | Required setup and observed evidence before acceptance |
| --- | --- |
| Android | Physical API 31+ device and API 33+ permission path; target API 36 behavior, supported lower-API compatibility checks; record OS/OEM/build, exact access/channel state, intended and actual display timestamps |
| Android scenarios | Closed process/task dismissal, offline, Doze/battery saver, future/overdue reboot, revocation/denial, force-stop then explicit reopen, reschedule/cancel/duplicate request, time-zone/DST changes and unchanged live timers; overdue alarms must not replay |
| iPhone | Physical iPhone on **iOS 17+** with installed HTTPS PWA, matching current app compatibility; oldest supported and current OS coverage, explicit gesture prompt, denied/revoked subscription and Focus settings recorded |
| iPhone scenarios | Closed app/locked screen, offline beyond expiry then reconnect, bounded delayed push, accepted-then-canceled race, TTL expiration, 410 retirement, notification click opening current state without diary mutation, offline/update worker compatibility |
| Server and family | Two isolated synthetic families/devices; reject cross-scope access, arbitrary recipient, expired invite, revoked device and old revision; concurrent claim/cancel and retries; demonstrate deletion and non-resurrection after restore; Android/iPhone handoff with stale/manual-sync history |
| Network/operations | Target Russian carrier/Wi-Fi reaches app/API and Apple push; selected resource/function region verified after authorized provisioning; owner confirms billing, retention, operator/contact and backup/deletion procedure |

**Stage-0 acceptance remains blocked by approvals:** provider/region/PAYG/privacy/enrollment choice and explicit acceptance of the non-clinical age-prior/prematurity limitations. Sources and platform requirements are documented; they are not clinical validation or successful delivery. Native stale-alarm handling is a concrete stage-4 implementation requirement, not a request to implement it during research. Unavailable physical devices/networks block delivery acceptance at stages 4–6; they are not by themselves proof that local stages 1–3 are impossible. The coordinator owns whether/when a subsequent stage may start after resolving stage-0 decisions; no stage begins automatically.

##### 0.6. Решения пользователя и условия закрытия этапа 0 — 24 октября 2026 года

Этот раздел имеет приоритет над историческими отметками `approval-blocked` выше в части согласований проекта. Он не превращает исследования в выполненные проверки доставки.

Пользователь явно утвердил:

1. Минимальный проект **Яндекс Functions + отдельный приватный файл состояния в Object Storage**, без Lockbox, YDB, Message Queue, VPS и платных подписок. На сервере — подписки и состояние напоминаний, не дневник ребёнка.
2. Ориентацию на бесплатные квоты без гарантии нулевого счёта. Это выбор архитектуры, а не разрешение создавать ресурсы или нести расходы.
3. Перенос согласования создания ресурсов, бюджета, фактических прав доступа и сроков хранения на период перед облачным запуском. Эти операционные согласования **не блокируют локальную разработку**.
4. Прогноз как **объяснимый немедицинский ориентир** с адаптацией по пригодной истории, без обещания точного засыпания. Возрастная таблица — стартовая инженерная гипотеза, не клиническая норма; состояние ребёнка и заданный режим имеют приоритет.
5. Поддерживаемые возраста необходимо явно определить **до этапа 2**. Для недоношенности нельзя автоматически выводить поправку из ПДР. Точный возрастной диапазон этим решением не утверждён.

Приватное состояние нельзя размещать в публичном бакете приложения. Разрешение на доступ к секретам, генерацию ключей, изменение IAM, создание бакета/функций и публикацию не получено. Пользовательские согласия на Web Push и глобальный маршрут Apple, конкретные сроки хранения, восстановление доступа и поведение при неизвестном результате отправки остаются условиями этапа 5 до включения облачной доставки, а не поводом незаметно включить её на этапе 1.

Техническая база этапа 0 собрана в разделах 0.1–0.5: источники, установленные API, ограничения, минимальная архитектура и расчёт нагрузки. Независимая проверка выполнена в отдельной сессии 24 октября 2026 года и зафиксирована в 0.7: утверждённые решения снимают блокеры проектирования локальных контрактов этапа 1. Неизмеренные стоимость/доставка, неподключённые устройства и невыбранные операционные политики остаются явно отложенными критериями соответствующих этапов, а не выполненными проверками.

##### 0.7. Independent stage-0 acceptance review — 24 October 2026

**Outcome: stage 0 accepted for local stage-1 contracts; background delivery and release are not accepted.** The coordinator confirmed the approvals recorded in 0.6 in this distinct review session. No repeated infrastructure approval is needed for that selected design. No remaining contradiction was found between those decisions and the documented technical prerequisites. Only the parent coordinator may sequence a fresh stage-1 session; this session ends at stage 0.

| Prerequisite | Evidence and accepted design boundary | Remaining gate, not claimed complete |
| --- | --- | --- |
| Age references and personalization | 0.1 [M1–M4] distinguishes daily sleep guidance from unvalidated wake-minute priors. The user accepted explainable non-clinical priors with adaptation, parent routine/child cues taking priority and no inferred EDD correction. The existing day-91 daily-total boundary and unbounded final age band remain identified limitations, not endorsed norms. | Define supported ages and applicable calendar-age boundaries before stage 2; do not invent clinical validation or replace personalization with the old indicator. |
| Android APK | 0.2 [A1–A4] records configured API 24 minimum/API 36 target, permission/exact-access constraints, offline/Doze/force-stop limits and the installed plugin's stale-alarm incompatibility. A distinct project-owned native scheduler with persisted freshness checks is the proposed stage-4 resolution, not an implemented feature. | Stage 4 requires physical-device evidence in 0.5, especially overdue reboot, delayed alarm, cancellation and unchanged live-timer behavior. |
| Installed iPhone PWA | 0.3 [W1–W3] records Web Push transport from iOS 16.4, while this app retains iOS 17+ support. Reuse the existing Angular worker/SwPush, explicit gesture subscription and visible generic notifications; no competing root worker or silent synchronization push. | Stage 5 requires actual HTTPS installation, permission/subscription, Focus/offline/TTL, cancellation races, click/update/offline-shell evidence on a physical iPhone. |
| Selected infrastructure | 0.6 selects Yandex Cloud Functions plus a separate private Object Storage state object, not the public PWA bucket; no Lockbox, YDB, Message Queue, VPS or paid subscription plan. The concrete 0.4.1 candidate uses one opaque family aggregate, ETag conditional writes, minute dispatcher and runtime IAM. [F1–F8,S1–S8,Y8–Y9] support the documented feasibility and limitations. | Russia-region placement, effective least-privilege permissions, protected server configuration and conditional-write/crash behavior must be proved after separately authorized provisioning. Region placement is not an observed deployment fact; Apple push remains a global processing route. |
| Authentication and deletion | 0.4/0.4.1 propose controlled owner bootstrap, revocable device verifiers, expiring one-use pairing, authenticated scope-derived mutations, CAS cancellation/deletion and non-resurrection. These are concrete security requirements, not selected enrollment/retention durations or implemented guarantees. | Before cloud delivery, approve enrollment/recovery, retention, configuration-reader exposure and global Apple processing; prove isolation, revocation, deletion and restore behavior with synthetic scopes. No public family-UUID claiming or public state is permitted. |
| Cost and availability | 0.4.1 models 43,200 minute ticks/GETs and 3 GB-hours at the stated 256 MiB/one-second assumption for 30 days. Free-quota targeting without zero-bill assurance is approved; account-shared allowances, public hosting traffic, retries and logs remain relevant. | Resource creation, spending authority, thresholds and actual usage are deferred to before cloud launch; budgets are not hard caps. Russian carrier/Wi-Fi and Apple/API reachability must be measured before delivery acceptance. |

**Verification performed in this session:** read the complete research, supplied repository rules and coordinator clarification; reconcile the historical proposals/blockers against 0.6; inspect `src/app/core/constants/wake-norms.const.ts:11–22`, `src/main.ts:13–16`, `.browserslistrc:11–15` and `DEPLOY.md:54–65`. Local spot-checks also confirmed `node_modules/@angular/service-worker/ngsw-worker.js:1700–1754` displays a titled notification and supports `navigateLastFocusedOrOpen`, and the installed Capacitor Kotlin sources `LocalNotificationRestoreReceiver.kt:42–48` and `TimedNotificationPublisher.kt:21–42` still reschedule overdue work and publish without forecast-expiry validation. These are source/configuration observations, not runtime delivery proof. The cited official-source investigation and earlier arithmetic/device-discovery results are preserved as prior evidence, not represented as rerun; no further network investigation was needed.

**Deferred gates retain their original acceptance criteria:** supported ages before stage 2; physical Android delivery at stage 4; authorized infrastructure, privacy/enrollment/retention decisions, ambiguous-send policy and physical iPhone delivery at stage 5; cross-device/manual-sync and full section-8 acceptance at stage 6. The conservative unknown-outcome no-retry policy in 0.4.1 remains a proposal requiring approval and failure-scenario evidence, not a promise of exactly-once external push. Unavailable devices, cloud runtime, effective ACL/logging/deletion evidence and measured costs remain real blockers to their respective delivery/release gates. The user's explicit scoped deferral permits local contracts; it neither deletes these gates nor authorizes a narrower final product.

**Change boundary:** only `RESEARCHES.md` was updated. No source or diary was transmitted externally; no diary data, environment files, credentials or keys were accessed. No build, unit test, runtime smoke, resource creation, deployment or stage 1–6 work was performed or claimed for this documentation-only acceptance review.



### Этап 1. Индивидуальный режим и контракты данных

**Зависимость:** этап 0.

**Задачи:**

- Настройки ночного диапазона, количества дневных снов, часового пояса и подготовки отдельно днём и вечером.
- Контракты циклов бодрствования, полноты истории и связи подготовки со сном.
- Разделение семейных данных и настроек устройства; правила версионирования, конфликтов и отставших данных для Supabase и ручного обмена через Яндекс Диск.
- Хранение и интерфейс режима, миграция, импорт/экспорт и передача новых общих настроек через существующие транспорты.

**Приёмка:** настройки переживают перезапуск; старые дневники и резервные копии работают без потерь; проверены переход ночного диапазона через полночь и явная смена часового пояса. Права устройства и push-подписки не передаются партнёру, новые уведомления автоматически не включаются.

Семейные контракты закладываются на этом этапе и реализуются вместе с соответствующими сущностями, а не откладываются до финальной проверки.

#### Stage 1 implementation record — 24 October 2026

**Status: stage 1 accepted by the coordinator on 24 October 2026 after application/UI checks and real isolated PostgreSQL migration/regression proof.** This is local implementation acceptance, not deployment or acceptance of stages 2–6. No forecast, preparation flow, reminder scheduler, push enrollment, new server transport or cloud resource was implemented. The existing profile remains local in family exchange, and preexisting sleep-pause/live-notification changes were preserved. The initially unavailable SQL-runtime check was completed after explicit user authorization in §1.4 below; no schema was applied to a live service.

##### 1.1. Delivered contracts and boundaries

- `SleepRoutine` is an exact-field, version-1 family value: named IANA zone/UTC, desired night-start `HH:mm` range (including midnight crossing), daytime nap count, independent day/night preparation minutes and assistant opt-in. Validation rejects missing/invalid zones, equal/invalid range endpoints, fractional/out-of-range counts and durations, wrong types, unknown routine versions and device/private fields inside the routine. Input limits 0–12 naps and 0–180 minutes are product validation limits, not medical recommendations.
- Existing `baby-tracker.v1` snapshots migrate in place with `sleepRoutine: null`; no device-derived timezone or assistant enablement is invented. The current profile, events including sleep pauses, active paused sleep/breast timers, tombstones, server cursor and pending edits remain intact. Legacy journals receive a revision-zero routine register, included in an existing outbox without replacing older pending edits.
- Explicit Settings Save persists the routine before changing signals. A new routine does not request permissions or enable notification delivery. Actual import clears stale form drafts even when the restored routine equals the already-saved value; unrelated diary changes do not refresh/discard the routine draft.
- JSON export is version 2, while valid version-1 diaries remain accepted. Export includes the nullable routine and existing diary/profile/timers, not credentials, journal/checkpoints, subscriptions or device delivery choices. Import validates before replacing the diary and **always disables the imported assistant**; a legacy backup clears the routine. With family sync enabled, import/reset publishes the corresponding routine replacement/null tombstone as well as existing event/timer changes.
- Both existing transports share the `sleepRoutine` LWW register. Whole-value revision/device ordering, retained resets, stale-scope/cursor rejection and in-flight local edits preserve the existing conflict/outbox semantics. Supabase still uses its existing RPC/Realtime/delta path; Yandex remains explicitly manual, emits packet version 2 and accepts valid version-1 packets. No hidden history upload was added. Both family clients must be upgraded together; old clients cannot understand the new register.
- `202610240002_sleep_routine.sql` locally widens the membership-checked incremental RPC, checks the routine value and preserves its row lock/cursor/tombstone contract. No live schema or credentials were accessed. PostgreSQL and browser ICU zone inventories may differ; validate the selected zone against the target database before rollout.
- `SPEC.md` §6.13 fixes concrete next-stage wake-anchor identity versus input revision, explicit unknown/incomplete/complete history assertions with UTC intervals and boundary revisions, and preparation-to-sleep identity/atomic-link constraints. Those future entities are documented rather than exposed as unused APIs or prematurely persisted. Their runtime/replication implementation belongs to the stage that introduces each entity.

**Files changed by stage 1:**

| Area | Files |
| --- | --- |
| Model/validation | `src/app/core/models/sleep-routine.models.ts` (new), `tracker.models.ts`, `sync.models.ts`, `yandex-sync.models.ts` in the same directory |
| Persistent diary/transport | `src/app/core/services/storage.service.ts`, `yandex-sync.service.ts` in the same directory; `SyncService` uses the widened existing guard/journal without a second transport or API |
| Settings | `src/app/features/settings/settings.page.ts`, `settings.page.html` |
| Deterministic regressions | `src/app/core/services/sleep-routine.spec.ts` (new), `sync.service.spec.ts`, `yandex-sync.spec.ts` |
| Local SQL | `supabase/migrations/202610240002_sleep_routine.sql`, `supabase/tests/sleep_routine.sql` (both new) |
| Documentation/change record | `README.md` (user instructions and change evidence), `SPEC.md` (current and next-stage contracts), `RESEARCHES.md` (this record and age-decision handoff) |

##### 1.2. Observed verification, not inferred delivery

The final post-integration commands ran sequentially on 24 October 2026, after the import-draft correction:

| Command/scenario | Observed result |
| --- | --- |
| `npx tsc --noEmit` | Exit 0; no TypeScript diagnostics |
| `npm run build` | Exit 0; production application bundle complete at 12:22:28 UTC, output `www` |
| `npx ng test --watch=false` | Exit 0; **18 files / 113 tests passed**, including 20 routine-boundary tests and both transport suites |
| Legacy storage migration | Synthetic profile, completed sleep with pause, paused active sleep and active breastfeeding retained; existing deletion/outbox/cursor preserved; no guessed routine |
| JSON/version/validation boundaries | v1 accepted, v2 exported/restored, imported assistant disabled; invalid routine/packet rejected before persistence; failed write does not publish; newer local edit survives an old acknowledgement and reset survives stale packets |
| Supabase local transport | Real `SyncService`/storage path with synthetic RPC/Auth/Realtime adapter: receive a remote routine, save an explicit new zone/opt-in, send only the changed routine register, retain local profile and clear only acknowledged outbox entries |
| Manual Yandex local transport | Two isolated real service/storage instances over a synthetic HTTP/disk adapter: consume legacy packet, exchange version-2 routine, edit zone on the second device, receive on the first and restart with the saved routine; no device/profile journal keys |
| Actual Settings UI | Angular dev server `http://localhost:4327/tabs/settings`, isolated Orca browser profile `stage1-routine-synthetic`; empty initial zone/assistant-off state observed; imported synthetic v1 file with a completed sleep and active sleep timer through the real confirmation UI |
| Actual Settings save/reload | Saved `23:00–01:00`, 2 daytime naps, 12/28 preparation minutes, explicit `Europe/Moscow`, explicit assistant checkbox; reloaded and observed all controls restored. Saved `America/New_York` explicitly; event/timer timestamps remained unchanged |
| Actual export/import | Invoked the real export handler and captured its generated JSON Blob without downloading a personal file; observed v2, complete synthetic event/timer and routine. Imported that exact JSON through the file-input/confirmation path; routine restored and assistant checkbox/persisted value both false, including after reload |
| Actual invalid input/import edge | `Europe/Imaginary` rejected with visible Russian error and unchanged saved zone. Reproduced stale unsaved draft after importing an identical saved routine, corrected explicit import hydration, then repeated the actual UI scenario: draft and persisted zone both `Europe/Moscow`, assistant false, same event/timer |

An initial production build rejected literal `min`/`max` attributes on Signal Form inputs; the implementation was corrected to installed Angular schema validators. An initial new failure-injection test attempted to spy on a Capacitor proxy method; it was corrected to the existing `Storage.prototype.setItem` failure pattern. The final sequence above passed after both corrections; these intermediate failures are not represented as successful checks.

Angular MCP workspace discovery and version-specific standards were loaded before editing; installed public declarations were checked for the range validators. Generic official Angular Signal Forms documentation was consulted without transmitting source or personal data. Modern Web Guidance's timezone/Temporal guides were searched: no guide API was applied because stage 1 stores wall-clock settings and does not yet resolve dated events or introduce Temporal/polyfills.

**Initial check limits, subsequently updated by §1.4:** SQL was initially unexecuted because the installed PostgreSQL tools were absent and Docker was unavailable; that local SQL proof gap is now closed by the authorized temporary runtime below, without changing production SQL. Adapter tests still do not prove deployed Supabase schema/Auth/Realtime, real Yandex account/CORS, physical-device synchronization, timezone-database parity across all supported devices or DST alarm delivery. Playwright MCP could not open its already-in-use profile; actual UI checks used a newly isolated Orca profile instead. No production diary, secrets, generated native folders, cloud state, resource/spend/deployment or device permission was changed. The initial UI smoke created no standalone script; temporary browser data/profile and local dev server were removed/stopped after verification. The separately authorized SQL smoke used temporary synthetic SQL fixtures, also removed as recorded below.

##### 1.3. User age decision carried to the next distinct session

The coordinator relayed the user's explicit choice during stage 1: automatic sleep-assistant applicability **from birth until the 18-month calendar anniversary**, with no automatic age-based forecast at or after that anniversary. The diary and manually entered routine remain available beyond that age; do not extrapolate the final infant-table band indefinitely. Use calendar-month age, not a fixed day-count approximation; for a missing target day in the anniversary month, clamp to that month's last day, interpreted in the explicitly selected routine zone. This records the upper applicability boundary, not clinical validation of wake-minute priors.

Newborn behavior must not enforce a rigid timetable or feeding restrictions. Do not infer gestational age or corrected sleep age from EDD. This decision supplies the age-range handoff required by 0.6–0.7; no age-based forecast, automatic age cutoff or change to existing diary behavior was implemented at stage 1. Stage 2 remains a separate coordinator-sequenced session after stage-1 review.

##### 1.4. Authorized real PostgreSQL follow-up — same stage-1 session, 24 October 2026

**Outcome: real SQL proof passed, no production migration fix required.** After the initial implementation report, the user explicitly authorized a public PostgreSQL download and a temporary isolated local database. This supersedes only the earlier missing-local-runtime limitation, not the deployment/device/privacy gates or coordinator-owned acceptance/sequencing.

**Runtime provenance and isolation:** queried the public [Postgres.app release v2.9.6](https://github.com/PostgresApp/PostgresApp/releases/tag/v2.9.6), downloaded its [PostgreSQL-17 DMG](https://github.com/PostgresApp/PostgresApp/releases/download/v2.9.6/Postgres-2.9.6-17.dmg) with `curl --fail --location --silent --show-error --output /tmp/lulio-stage1-pg.6ysINT/postgres.dmg <public asset URL>`. `shasum -a 256` returned `b38bb00b8c8702a568270aab85995c550f7f93d1503b818efdc5ff9a519b7168`, matching the public release digest. Mounted read-only/no-browse under that unique temporary directory; no application/global install, system service, PATH modification or Docker was used.

Observed `postgres --version`: **`postgres (PostgreSQL) 17.11 (Postgres.app)`**; server architecture `aarch64-apple-darwin23.6.0`. Binaries were executed directly from `mount/Postgres.app/Contents/Versions/17/bin/` below the temporary root. Initialized with `initdb --pgdata=/tmp/lulio-stage1-pg.6ysINT/data --username=stage1 --auth=trust --encoding=UTF8 --locale=C`. Started with `postgres -D /tmp/lulio-stage1-pg.6ysINT/data -k /tmp/lulio-stage1-pg.6ysINT -p 56437 -h '' -c wal_level=logical`: **Unix socket only, no TCP listener**, new local synthetic cluster rather than an existing database.

The temporary bootstrap created only `anon`/`authenticated` no-login roles, `auth.users(id uuid primary key)`, a minimal `auth.uid()` reading the test `request.jwt.claim.sub`, schema grants and `supabase_realtime` publication. These fixtures allow actual PL/pgSQL/RLS/function-grant execution; they do not emulate or validate real Supabase JWT verification, HTTP Auth or Realtime delivery.

**Executed commands/results** (`psql` below means the downloaded binary, not a globally installed tool):

```text
psql -X -h /tmp/lulio-stage1-pg.6ysINT -p 56437 -U stage1 -d postgres -v ON_ERROR_STOP=1
  -f /tmp/lulio-stage1-pg.6ysINT/bootstrap.sql
  -f supabase/migrations/202610200001_family_sync.sql
  -f supabase/migrations/202610240001_incremental_family_sync.sql
  -f supabase/migrations/202610240002_sleep_routine.sql
  -f supabase/tests/incremental_family_sync.sql
  -f supabase/tests/sleep_routine.sql
```

All migrations and both test transactions completed with exit 0. After extending the permanent routine regression, reran both SQL tests with the same connection and `-v ON_ERROR_STOP=1`: **`SYNC_SQL_OK snapshot_bytes=234813 idle_bytes=29`**, **`ROUTINE_SQL_OK`**, exit 0. Explicit post-test queries observed **0 remaining synthetic users and 0 families** in that test database.

The expanded `supabase/tests/sleep_routine.sql` directly exercises:

- midnight-crossing routine accepted unchanged and retry without an extra server version;
- unknown zone, equal night endpoints, fractional naps, negative/excessive preparation, null assistant, wrong value type and device-delivery/private fields rejected before commit;
- higher UUID winning an equal-revision routine conflict and losing edits leaving the cursor unchanged;
- null reset retained against stale writes;
- routine + completed sleep event + next active sleep timer accepted as one atomic delta/version; replayed durable outbox idempotent and an acknowledged cursor returning no redundant history;
- a valid event mutation followed by an invalid routine in one request rolled back completely, preserving event/timer values and cursor;
- routine-only reset preserving unrelated event/timer registers;
- authenticated non-member and absent identity rejected by the real RPC, with RLS hiding family metadata.

The existing incremental regression also passed against the new function: event tombstones, active-timer conflicts, independent offline additions, invalid/skipped cursors, member-only reads, direct-register access denial and replay/delta behavior remained intact. Client-side outbox persistence/in-flight acknowledgement is the separate earlier 113-test evidence; a SQL fixture does not claim to execute an Angular storage instance.

**Real upgrade smoke:** created a second fresh database `stage1_upgrade`, applied the actual first migration, inserted a synthetic member and seeded the old RPC with four registers: completed sleep, deleted-event tombstone, paused active sleep timer and paused breast timer. Captured the old family JSON, then applied the actual incremental and routine migrations in order and compared the resulting RPC snapshot exactly. Observed **`LEGACY_UPGRADE_OK entries=4 cursor=1 unchanged=true`**: all four values/revisions/devices and membership retained, server cursor initialized to 1, obsolete RPC still removed, and **no routine/assistant opt-in invented by SQL**.

**Cleanup observed:** `pg_ctl -D /tmp/lulio-stage1-pg.6ysINT/data -m fast -w stop` reported `server stopped`; the supervised PostgreSQL process exited 0. `hdiutil detach /tmp/lulio-stage1-pg.6ysINT/mount` ejected the image, then the unique temporary root was removed, including both synthetic databases, DMG and bootstrap/upgrade smoke SQL. No unrelated files or databases were deleted. Permanent follow-up changes are only `supabase/tests/sleep_routine.sql`, `README.md`, `SPEC.md` and this record; no production SQL/TypeScript/UI changed, so the previously successful sequential TypeScript/build/113-test checks were retained rather than blanket-rerun.

**Remaining limits:** no live schema migration, cloud access, resource creation/spend, credentials, production diary, real Supabase Auth/Realtime/Yandex account, network/carrier availability, physical devices or reminder delivery was exercised. PostgreSQL 17.11 local success does not assert a deployed server's version/timezone database or configuration. Stage-1 acceptance remains the parent's decision after this evidence; stage 2 has not begun.

### Этап 2. Персональный прогноз

**Зависимость:** этап 1.

**Задачи:** детерминированный расчёт ближайшего дневного сна, ухода в ночь и времени подготовки по разделу 5; разделение возрастного ориентира и персонализации; отбор пригодных подтверждённых интервалов и способ отметить полноту истории; источник, число образцов, причина пересчёта и версия входных данных. Пересчёт после исправлений, удаления, импорта, изменения режима и семейного обмена.

**Приёмка:** одинаковые входы дают одинаковый результат; история объяснимо влияет на прогноз; пропущенные записи не становятся ложными длинными окнами; часы не сдвигают сон бесконечно вперёд. Проверены нехватка истории, будущие/перекрывающиеся записи, границы возрастов и конфликт с целевым ночным временем. Числовые гипотезы не выдаются за подтверждённую точность.

#### Stage 2 implementation record — 24 October 2026

**Outcome: stage 2 accepted by the coordinator on 24 October 2026 based on the documented calculator/UI, TypeScript/build/133-test and real PostgreSQL evidence.** This is local acceptance, not medical accuracy or deployed notification proof. Stages 0–1 and the parent's explicit birth-until-18-calendar-month age decision were prerequisites. This session implements the pure calculator, persisted usable personalization inputs and existing-family replication, not a stage-3 card/preparation lifecycle or stage-4/5 delivery. Preexisting pause/native changes were preserved; generated native code was not edited. The parent coordinator owns the next distinct session.

##### 2.1. Delivered behavior and exact change ownership

- `calculateSleepForecast(input, now)` returns nearest daytime sleep or night, preparation UTC instant, engineering range, desired dated night range/conflict, stable anchor, input version, source, selected sample count/kind, history median/weight, reasons and applicability deadline. Disabled, unknown, active/paused-sleeping, out-of-age, ready and overdue states are explicit. Completed-sleep identity is `sleep:<event.id>`; persisted manually confirmed waking uses `wake:<UUID>` and preserves identity on time edits. Missing data never creates a midnight anchor; cancellation invents no waking.
- Median personalization uses only explicitly complete adjacent waking gaps from the preceding 14×24 hours relative to the fixed anchor. Unknown, incomplete, stale, future, zero and overlapping boundaries are excluded without deleting raw history. Incomplete overlaps win. Day/night samples are separate; same-ordinal subsets need five samples and a confirmed chain since the last night. Unknown chain segments prevent invented ordinals. `min(0.8,n/(n+5))` blends history after five samples; no unsupported short-sleep/illness/EDD corrections or feeding restrictions were added.
- Both input fact types are actual persisted family entities, not unused model scaffolding. Boundary revision is a canonical semantic sleep-content revision, including updatedAt and pauses; it survives backup and transport changes while any boundary edit invalidates confirmation. Forecast input version additionally records transport revision/device pairs. Manual confirmation validates UTC UUID/time, future times, active sleep and times inside recorded sleep. Assertion validation checks exact fields, positive UTC half-open bounds and current boundary revisions.
- The actual Tracker page now has a native details disclosure, labeled Signal Forms waking input, edit/delete, complete/incomplete and remove-confirmation actions. Stale boundary confirmation is visible and can be reconfirmed using the same assertion UUID. There is no implicit day-completeness switch or guessed morning; the minimal UI confirms actual between-sleep intervals.
- Existing `baby-tracker.v1` snapshots migrate missing fact arrays to empty arrays without replacing profile/events/pauses/timers/journal/cursor/outbox. JSON export is version 3; valid versions 1–2 import with lossless legacy defaults. Restored assistant is always disabled. `wake:<uuid>` and `assertion:<uuid>` registers use existing LWW/tombstone/outbox/scope safeguards in Supabase and manual Yandex; new Yandex packets are v3 and valid v1/v2 packets remain readable. No private reminder/device state, permission request, cloud diary transport or push enrollment was introduced.
- Applicable age is birth until but excluding the clamped 18-month calendar anniversary in the saved routine zone. Existing wake-prior bands now use calendar months 0/1/2/3/4/5/6/8/12, stop at 18, and never infer correction from EDD. The existing indicator uses that applicability too, but is not substituted for personalization. Existing daily-total fields remain unused by the calculator and are documented as separate legacy data, not AASM/WHO validation of minute-level forecasts.
- After an explicit user approval relayed by the parent, installed **`@js-temporal/polyfill` 0.5.1** with `npm install --save-exact @js-temporal/polyfill --ignore-scripts --no-audit --no-fund`. Public exports/types and official [Temporal documentation](https://tc39.es/proposal-temporal/docs/zoneddatetime.html), [polyfill usage](https://github.com/js-temporal/temporal-polyfill#usage) were checked; Context7 queries contained only generic public API questions, no source/data. Explicit module import only, no global patch. Compatible disambiguation selects the first fold occurrence and shifts a gap forward by its transition length; independently inverted narrow night endpoints collapse to the resolved start with `collapsedByDst` and an explicit reason. Calendar-day bounds handle 23/25-hour days.
- Signals memoize heavy calculation behind persisted inputs and calendar/future-fact applicability keys. Ordinary clock ticks only change countdown/overdue state. Input versions include material eligibility/age transitions but not ticking seconds; recalculation reasons distinguish import, history/facts, timer, profile/routine and family/scope changes. String ordering uses deterministic code-unit comparisons rather than environment-dependent collation.

| Area | Exact files changed |
| --- | --- |
| Dependency | `package.json`, `package-lock.json` |
| Models and guards | `src/app/core/models/sleep-history.models.ts` (new), `tracker.models.ts`, `sync.models.ts`, `yandex-sync.models.ts` |
| Pure calculation and calendar | `src/app/core/services/sleep-calendar.ts`, `sleep-history.ts`, `sleep-forecast.ts` (new); `src/app/core/constants/wake-norms.const.ts` |
| Signals/storage/transports | `src/app/core/services/sleep-forecast.service.ts` (new), `storage.service.ts`, `wake-window.service.ts`, `yandex-sync.service.ts`; existing `SyncService` uses the widened shared journal/guards without a second API |
| Usable fact UI | `src/app/shared/components/sleep-history-editor.component.ts` (new), `src/app/features/tracker/tracker.page.ts`, `tracker.page.html`, `src/app/features/settings/settings.page.html` |
| Behavioral tests | New `src/app/core/services/sleep-forecast.spec.ts`, `sleep-forecast.service.spec.ts`, `sleep-history-storage.spec.ts`; extended `sleep-routine.spec.ts`, `sync.service.spec.ts`, `yandex-sync.spec.ts` |
| Actual local SQL | `supabase/migrations/202610240003_sleep_forecast_facts.sql`, `supabase/tests/sleep_forecast_facts.sql` (new) |
| User/contracts/evidence | `README.md`, `SPEC.md` §6.1/6.10–6.14, `RESEARCHES.md` (this record) |

##### 2.2. Observed final verification

After final production/template/test edits, ran TypeScript, production build and Vitest sequentially. Angular MCP workspace discovery and version-specific standards were loaded before editing; its required target runner executed the same configured Angular targets as the repository npm/CLI commands, rather than claiming a separate shell invocation.

| Command or actual scenario | Observed result |
| --- | --- |
| `npx tsc --noEmit` | Exit 0, no diagnostics |
| Production `app:build:production` through Angular MCP `run_target` (the `npm run build` / `ng build` target) | Success at **17:47:00 UTC**, output `www`, no budget error |
| `app:test` through Angular MCP with `watch:false` (the `npx ng test --watch=false` target) | Success at **17:47:08 UTC**; **21 files / 133 tests passed** |
| Final production footprint | Initial **1.28 MB raw / 287.29 kB estimated transfer**, Tracker lazy **80.55 kB / 18.44 kB transfer**. Angular reports a real **`jsbi` CommonJS optimization warning** from the approved Temporal dependency; it is disclosed, not suppressed. No clean before/after bundle delta was measured |
| Standalone actual-calculator smoke | Bundled actual local calculator with installed `node_modules/.bin/esbuild` into `/tmp/lulio-stage2-smoke.KM5EPv/calculator.mjs`, executed with `node`; **`calculatorSmoke: PASS`** |
| No history / age only | No anchor → unknown; manually confirmed 08:00 UTC at four calendar months → 10:00 sleep / 09:50 preparation, source age-prior |
| Meaningful history / incomplete | Five 180-minute complete daytime gaps → median 180, weight 0.5, 10:30 prediction. One incomplete assertion → four samples, age-prior 10:00; no guessed missing-long-gap training |
| Night, sleeping and overdue | Zero requested naps chooses night and exposes before-target conflict without clamping to 20:00. Active sleep gives sleeping. Passing time gives overdue with unchanged predicted instant |
| DST and age | New York 2026-03-08 02:30 → 07:30Z, 2026-11-01 01:30 → first 05:30Z; 23/25-hour days and inverted narrow target range covered. Calendar month-band, month-end-clamped 18-month zone-local cutoff and no EDD correction covered |
| Regression boundaries | Permanent tests additionally cover input-order determinism, future/zero/overlap exclusion, incomplete precedence, same-updatedAt boundary edits/reconfirmation, stable anchor identity, separate night/ordinal selection, import invalidation, cancellation, failure-safe validation, per-fact tombstones, in-flight edits and late old-scope responses |
| Both transport paths | Real Supabase service/storage over synthetic RPC/Auth/Realtime adapter receives waking and sends edits/deletion; two real Yandex service/storage instances over synthetic HTTP/Disk exchange wake/assertion facts, edit/incomplete changes, deletions and restart without resurrection |

**Actual isolated UI, not a mocked component:** Angular devserver `http://localhost:4328`, newly created Orca isolated profile `stage2-forecast-synthetic` (`accd2367-97b7-4a0e-8944-c02cf614fdb5`). Seeded only a synthetic local profile, two completed sleeps and an explicit UTC routine, then exercised rendered controls/native events:

1. Unknown interval → “Все сны записаны” persisted an assertion; “Есть пропуски” changed it to incomplete and excluded its sample.
2. Native datetime-local input + actual form submit persisted manual 11:00Z waking; “Уточнить” + submit changed it to 11:30Z with the **same UUID**. Reload restored waking/assertion and forecast anchor; future 2999 input produced the visible validation error without changing the saved waking.
3. Changed the synthetic boundary using the real storage API (not a claim of finishing the existing animated modal): UI rendered “Границы изменились”, status became unknown, and the actual complete button reconfirmed current boundaries with the **same assertion UUID**.
4. Actual Settings export button generated v3 JSON containing both fact entities, two events and no private sync/permission/subscription keys. Captured its Blob, supplied that exact JSON as a File through the actual file input/change handler, observed explicit replacement confirmation, then clicked the real confirmation button. Wakes, full assertion content and events were exactly preserved; assistant became false and stayed false after reload.
5. Actual service observation with the public clock refresh and a temporary synthetic Date.now override showed the memoized calculated object and input version unchanged across an ordinary one-second tick; the override was restored immediately. Permanent service tests separately cover countdown, overdue, edit/import/sleep/cancel transitions.

**Intermediate failures/corrections:** a misplaced editor patch briefly produced a devserver syntax error; it was reread/corrected immediately and all final checks/UI proof above use the corrected component. Ordinal classification was tightened to require complete chains; future-history controls now refresh only at applicability transitions; code-unit ordering and narrow DST-range collapse were explicitly implemented before final verification. An initial smoke probe tried to set the readonly clock signal and was corrected to its public `refresh()` API. An Orca requestAnimationFrame wait stalled an auxiliary animated-modal attempt; closed that synthetic tab and resumed ordinary input/export/import checks in a fresh tab of the same isolated profile. The separate Playwright MCP profile was already in use; it was not taken over. None of these failed attempts is reported as successful modal/device coverage.

##### 2.3. Actual temporary PostgreSQL proof and cleanup

Reused the stage-1 approved public runtime provenance, not an installed/live database: downloaded [Postgres.app v2.9.6 PostgreSQL-17 DMG](https://github.com/PostgresApp/PostgresApp/releases/download/v2.9.6/Postgres-2.9.6-17.dmg) into `/tmp/lulio-stage2-pg.fMO3pl/postgres.dmg`. SHA-256 was **`b38bb00b8c8702a568270aab85995c550f7f93d1503b818efdc5ff9a519b7168`**, matching the approved public release/stage-1 digest. Mounted readonly/nobrowse; observed server **PostgreSQL 17.11 (Postgres.app), aarch64-apple-darwin23.6.0**.

Executed `initdb --pgdata=/tmp/lulio-stage2-pg.fMO3pl/data --username=stage2 --auth=trust --encoding=UTF8 --locale=C`, then `postgres -D /tmp/lulio-stage2-pg.fMO3pl/data -k /tmp/lulio-stage2-pg.fMO3pl -p 56438 -h '' -c wal_level=logical`: observed **Unix socket only, no TCP listener**. Bootstrap created synthetic no-login anon/authenticated roles, auth.users, auth.uid() reading the fixture JWT-sub setting, grants and a Realtime publication. This executes real PostgreSQL validation, PL/pgSQL, row locks/RLS/grants, not real Supabase JWT/HTTP/Realtime.

```text
<downloaded psql> -X -h /tmp/lulio-stage2-pg.fMO3pl -p 56438 -U stage2 -d postgres -v ON_ERROR_STOP=1
  -f /tmp/lulio-stage2-pg.fMO3pl/bootstrap.sql
  -f supabase/migrations/202610200001_family_sync.sql
  -f supabase/migrations/202610240001_incremental_family_sync.sql
  -f supabase/migrations/202610240002_sleep_routine.sql
  -f supabase/migrations/202610240003_sleep_forecast_facts.sql
  -f supabase/tests/incremental_family_sync.sql
  -f supabase/tests/sleep_routine.sql
  -f supabase/tests/sleep_forecast_facts.sql
```

All four actual migrations and all three SQL regression transactions passed. After tightening UUID validation for fact tombstones, reapplied the actual final migration and reran all three regressions with the same ON_ERROR_STOP connection: **`SYNC_SQL_OK snapshot_bytes=234813 idle_bytes=29`**, **`ROUTINE_SQL_OK`**, **`FORECAST_FACTS_SQL_OK`**, exit 0. Final query returned **0 synthetic users / 0 families**. New SQL proves mixed fact/event atomic deltas, idempotent replay, empty idle deltas, exact fact/private-field/date/interval/boundary validation, rollback of mixed invalid requests, equal-revision UUID ordering, retained fact deletions against stale packets and nonmember rejection; existing regressions preserve routine/timer/event/cursor/access contracts.

**Cleanup observed:** `pg_ctl ... -m fast -w stop` reported server stopped and the supervised PostgreSQL process exited 0; `hdiutil detach` ejected the readonly image and the unique temporary PostgreSQL root was removed. Calculator smoke script/bundle directory was removed. Closed both synthetic browser tabs, deleted only the newly created isolated profile and stopped the Angular MCP devserver. The generated synthetic backup download was identified by its current timestamp/size and removed; preexisting similarly named downloads were left untouched.

##### 2.4. Remaining limits and concrete next-stage contract

Stage 2 has local calculation/storage/UI/transport-adapter/actual-SQL evidence, **not** medical accuracy, deployed schema, real Supabase/Yandex credentials/accounts, physical devices, live family handoff, cloud resources or notification delivery. No environment files, credentials, keys or production diary were read, uploaded or modified. No cloud migration/deployment, IAM change, subscription enrollment or permission request occurred. Free dependency/runtime downloads do not authorize cloud resource creation or spend. Browser/PostgreSQL zone-database parity still needs checking on target deployments; no Safari device was exercised. The known jsbi optimization warning and final bundle footprint remain disclosed dependency costs, not hidden failures.

The coordinator alone may accept this stage and launch a **new stage-3 session**. Its card must consume `SleepForecastService.forecast/countdownSeconds`, display its source/count/reasons/range/conflict and overdue/unknown/out-of-age states, and keep stable scope/anchor identity separate from changing input version. It must implement actual persisted/replicated/backed-up preparation UUID/state and atomically allocate/reuse one sleep ID when linking “asleep”, preserving zero-or-one completed preparation per resulting sleep and reconciling edits/deletions; see SPEC §6.13–6.14. Preparation is not sleep, missing duration is unknown, and stale forecasts require clarification. Stages 4–5 still own durable reminder consent/deduplication/freshness and physical Android/iPhone delivery; this stage neither launches them nor weakens their acceptance.


### Этап 3. Подготовка ко сну и интерфейс

**Зависимость:** этап 2.

**Задачи:** карточка сна и подготовки с основанием прогноза и состоянием актуальности; действия «Начать подготовку», «Уснул», «Уточнить пробуждение», «Не напоминать об этом сне». Отдельное сохранение подготовки, её семейная репликация и связь с существующим таймером сна без дублирования записей. Если выводится оставшийся план дня, он явно предварительный.

**Приёмка:** на реальном интерфейсе пройден путь «пробуждение → прогноз → подготовка → сон → новое пробуждение»; подготовка не запускает сон; перезапуск не теряет состояние; просроченный прогноз требует уточнения, не создаёт ложное пробуждение.

**Результат этапов 1–3:** помощник работает внутри приложения, но фоновые напоминания ещё не готовы.

#### Stage 3 implementation record — 24 October 2026

**Outcome: stage 3 accepted by the coordinator on 24 October 2026 based on final TypeScript/build/141-test checks, actual isolated mobile lifecycle smokes and real PostgreSQL evidence below.** This is local scenario acceptance, not deployment or background delivery. Accepted stages 0–2, user pause/native timer changes and stage-2 calculator/facts were retained; generated native code was not edited. The parent coordinator owns the next distinct session and later physical-device gates.

##### 3.1. Delivered behavior and exact files

- Tracker has a real footer assistant card consuming existing `SleepForecastService.forecast/countdownSeconds`. Approximate sleep/preparation/range, source, sample count, localized reasons and desired-night conflict are visible; disabled, unknown, sleeping including pause, out-of-age and overdue states are explicit. Clarification opens/focuses the existing waking input. Overdue start is rejected again inside the storage transaction; it never silently shifts the prediction or creates waking. Already-running valid preparation can record factual “asleep” after the estimate passes.
- Preparation persists independently without a sleep timer. A cycle UUID-v5 is derived in the standard URL namespace from `['baby-tracker-sleep-cycle', scope, anchorId]`; each actual preparation attempt has its own UUID-v4. One `preparation:<cycle UUID>` LWW register chooses competing family attempts. Its exact UTC lifecycle/link fields and the separate content revision are specified in SPEC §6.15. “Asleep” commits completion/link and timer together; that one sleep ID survives reload, pause/resume, stop and duplicate actions. The same cycle identity, rather than a plan revision, keys `suppression:<cycle UUID>`.
- Both fact arrays participate in the existing Preferences transaction, journal, Supabase outbox/cursor and Yandex immutable packet transport. Backup/packet version is 4; valid legacy versions 1–3 remain readable. Export excludes device/connection/permission/subscription state. Import disables the assistant, cancels unfinished preparation, preserves diary/timers and valid completed preparation, and invalidates derived plans. No separate sync API or reminder-delivery transport was added.
- Anchor edits/deletions, new cycles, disabled assistant, scope/import changes and missing/mismatched linked sleep reconcile preparation without inventing sleep/waking. Remote invalidation now writes a **new durable cancellation revision and outbox entry in the same merge commit**, so restoring previous settings/content cannot resurrect the attempt. Late terminal event/tombstone defeats an older timer. Ordinary sleep allocates its ID at start; legacy persisted timers derive a deterministic legacy ID. Unknown preparation duration is not rendered as zero. Existing independently recorded overlapping diary entries are not silently deleted; stage-2 conflict exclusion remains in force.

| Area | Exact files changed in this stage |
| --- | --- |
| Models/guards | New `src/app/core/models/sleep-assistant.models.ts`; modified `tracker.models.ts`, `sync.models.ts`, `yandex-sync.models.ts` |
| Durable lifecycle/timers/transport | New `src/app/core/services/sleep-preparation.ts`; modified `storage.service.ts`, `active-timer.service.ts`, `yandex-sync.service.ts` |
| Actual UI | New `src/app/shared/components/sleep-assistant-card.component.ts`; modified `sleep-history-editor.component.ts`, `src/app/features/tracker/tracker.page.ts`, `tracker.page.html` |
| Behavioral regressions | New `src/app/core/services/sleep-preparation.spec.ts`; modified `sleep-routine.spec.ts`, `sync.service.spec.ts`, `yandex-sync.spec.ts` |
| Actual SQL | New `supabase/migrations/202610240004_sleep_preparations.sql`, `supabase/tests/sleep_preparations.sql` |
| Contracts/user instructions/evidence | `README.md`, `SPEC.md`, `RESEARCHES.md` |

No dependency, generated native code, environment/credential file, cloud resource or deployment was changed by this stage.

##### 3.2. Final sequential checks and corrected failures

After the last production edit, executed these checks **sequentially**, with no edits during Vitest:

| Check | Observed result |
| --- | --- |
| `npx tsc --noEmit` | Exit 0, no diagnostics |
| Angular MCP `app:build:production` (configured `npm run build` target) | Success **18:13:02 UTC**, output `www` |
| Angular MCP `app:test` with `watch:false` (configured `npx ng test --watch=false` target) | Success **18:13:07 UTC**, **22 files / 141 tests passed** |
| Production footprint | Initial **1.28 MB raw / 290.61 kB transfer estimate**; Tracker lazy **87.51 kB / 19.49 kB** |
| Dependency warning | Existing Temporal `jsbi` CommonJS optimization warning remains disclosed, not suppressed |
| Both real transport services over synthetic adapters | Supabase RPC receives preparation and publishes cancellation delta; two Yandex storage/service instances exchange preparation/suppression, complete on the other parent, replicate the linked timer and retain anchor-deletion cancellation after restart |

The first suite caught an immediate-next-wake clock-refresh omission, corrected by refreshing the central clock after stop; an unsuitable Capacitor Proxy spy was replaced with the existing backing `Storage.setItem` failure seam. A legacy migration test now verifies preserved timer content without requiring the newly introduced identity field to be absent. A dedicated added regression **failed before** the final remote-invalidation fix (`preparing` returned after remote disable/re-enable) and passes after the merge durably journals cancellation; the final full suite includes this regression. Temporary edit/parser mistakes were corrected before final checks and are not presented as passing intermediate runs.

Permanent tests protect preparation-without-sleep, atomic write failure, same identity through duplicate taps/restart/pause/stop, next waking, stale/overdue actions, anchor edit/delete and timer cancellation, family LWW replacement/late scope reply, durable remote cancellation, cycle suppression, legacy imports and completed preparation roundtrip. Existing native/timer/forecast facts regressions all pass.

##### 3.3. Actual isolated synthetic UI evidence

Used Angular MCP devserver **`http://localhost:4329/tabs/tracker`**, newly created isolated Orca profile `stage3-preparation-synthetic` (`bdc81922-a5c2-48f2-9325-eb7cc5a67e3d`), initially emulated iPhone 12 at 390×844. No existing user profile or real account was used.

1. Seeded a synthetic four-month profile and UTC routine only. Unknown state showed no invented waking. The actual clarification button opened the existing editor; native input/change events and actual form submission saved waking and produced a forecast.
2. Duplicate actual “Начать подготовку” button clicks persisted **one** preparation; observed **null sleep timer / empty events**. Reload restored the same attempt UUID and start.
3. Duplicate actual “Уснул” clicks linked one stable sleep ID, `6716d644-f129-5a97-8340-88acc584af34`; reload restored that timer/link. Existing sleep-modal pause produced `pausedAt`, while the card remained sleeping and the preparation remained completed. Duplicate actual modal stop clicks produced one event with that same ID and a new forecast from its end, not a new manual wake.
4. Actual “Не напоминать об этом сне” control persisted a cycle suppression; reload restored it and its visible skipped message. Preparing the next cycle, then editing its boundary through real storage, cancelled only the dependent attempt. Deleting the linked sleep cancelled its completed link without creating events/timers.
5. Actual existing wake-edit button and form changed the **same waking UUID** to three hours earlier. Card became overdue, retained the historical predicted time, offered clarification and rendered **zero preparation-start buttons**; no waking/timer was fabricated. After the focus fix, direct observation of the actual clarification action returned `focused:true`.
6. Through the real running page's StorageService API, switched to a synthetic scope while preparing: preparing count went **1→0**, timer stayed null. Exported/imported the actual v4 data while another scoped attempt was preparing: all unfinished attempts cancelled, wake retained, assistant false, no private export keys; reload rendered disabled. This stage exercised the real storage import path, **not a second claim of the Settings file-picker workflow** already exercised in stage 2.
7. Synthetic out-of-age profile rendered unavailable with no preparation-start button. Zero requested naps rendered the night conflict, source/count and localized reasons without clamping. Final linked sleep displayed “Подготовка: менее минуты”; an ordinary real timer without preparation displayed “Длительность подготовки неизвестна”.
8. Primary preparation/clarification buttons measured **52 CSS px**; dock buttons **72 px**. Observed preparation action `y=634` in the initial 844-high view; after expanded/mobile viewport reflow, `y=1125`, height 52, in an `innerHeight=1329` view. Both are in the bottom third. Explanations remain in a native scrollable disclosure, not tiny primary controls.

After the final remote-cancellation fix, created another **new isolated** profile `stage3-reconciliation-synthetic` (`aa248342-55f5-436f-8ca7-fc9302718095`). Exercised real `configureSupabaseSync`/prepare/merge APIs without enabling any network transport: remote off→on left `state=cancelled`, durable pending cancellation, null timer and enabled routine; actual card returned to forecast rather than resurrecting preparation.

##### 3.4. Actual PostgreSQL execution and cleanup

Reused approved public provenance: [Postgres.app v2.9.6 PostgreSQL-17 DMG](https://github.com/PostgresApp/PostgresApp/releases/download/v2.9.6/Postgres-2.9.6-17.dmg), downloaded to `/tmp/lulio-stage3-pg.cy1O1B/postgres.dmg`. Observed SHA-256 **`b38bb00b8c8702a568270aab85995c550f7f93d1503b818efdc5ff9a519b7168`**, matching prior approved evidence. Mounted readonly/nobrowse. Observed **PostgreSQL 17.11 (Postgres.app), aarch64-apple-darwin23.6.0**.

Initialized with `initdb --pgdata=/tmp/lulio-stage3-pg.cy1O1B/data --username=stage3 --auth=trust --encoding=UTF8 --locale=C`; started `postgres -D .../data -k /tmp/lulio-stage3-pg.cy1O1B -p 56439 -h '' -c wal_level=logical`. Logs showed **Unix socket only**, no TCP listener. Bootstrap created synthetic no-login roles, `auth.users`, fixture `auth.uid()` and Realtime publication; no real Supabase Auth/HTTP/JWT/Realtime service was contacted.

Executed downloaded `psql -X -h /tmp/lulio-stage3-pg.cy1O1B -p 56439 -U stage3 -d postgres -v ON_ERROR_STOP=1` with bootstrap, **all five actual migrations in order**, then:

```text
supabase/tests/incremental_family_sync.sql → SYNC_SQL_OK snapshot_bytes=234813 idle_bytes=29
supabase/tests/sleep_routine.sql           → ROUTINE_SQL_OK
supabase/tests/sleep_forecast_facts.sql    → FORECAST_FACTS_SQL_OK
supabase/tests/sleep_preparations.sql      → PREPARATIONS_SQL_OK
```

Exit 0. New regression proves atomic preparation/suppression deltas, idempotent retry, completion/timer transaction, empty idle delta, exact/private/invalid-date/time-order/state/link/UUID rejection, mixed invalid-request rollback, retained tombstones against stale packets and nonmember denial. Final query observed **0 synthetic users / 0 families**.

**Cleanup observed:** `pg_ctl ... -m fast -w stop` returned server stopped; supervised PostgreSQL exited 0. `hdiutil detach` ejected `disk4`; removed the unique temporary database/download/bootstrap root. Closed both synthetic tabs, deleted both newly created isolated profiles, and stopped both smoke devserver instances through Angular MCP. No permanent throwaway scripts, synthetic databases, browser profiles, downloads or running services remain from this stage.

##### 3.5. Limitations and next-stage boundary

No real family account, production diary, deployed schema, physical Android/iOS/Safari, live native notifications, medical accuracy, carrier/network delivery or deployment was verified. No credentials, environment files, private keys, subscriptions or real device consent were read/exported; no cloud resources, IAM, spending or server scheduler were created. No automated axe audit or assistive-technology user test was run. The existing `jsbi` warning and actual bundle footprint remain known costs.

Only the coordinator may accept stage 3 and launch the next distinct session. Stage 4 must consume persisted cycle suppression and durable lifecycle facts, maintain separate per-device delivery consent/deduplication/freshness, and preserve current quiet live-timer notifications. **The physical-device prerequisite and previously approved privacy/platform gates remain open; background reminders are not delivered by stages 1–3.**

### Modern Web Guidance

- **`accessibility`**: I kept explanation in native details and used minimum-height 52px actions rather than fixed-height targets, preserving text growth and one-handed mobile placement (“Enforce with `min-block-size` / `min-inline-size` or padding rather than `width` / `height`, so content can grow the target but not shrink it.”). Existing Ionic/native input semantics were retained; the real clarification focus path was exercised.


### Этап 4. Уведомления Android

**Зависимость:** этап 3.

**Задачи:** устойчивое намерение напоминания и локальное планирование средствами ОС; перенос, отмена и защита от повторов по циклу; отдельный канал подготовки, не подмена текущих тихих хронометров. Обработка разрешений, перезапуска, отключения помощника, импорта и смены семьи. Нажатие открывает текущую карточку без изменения дневника.

**Приёмка:** на физическом Android проверены закрытое приложение, офлайн, перезагрузка, энергосбережение, отказ в разрешении, перенос и отмена. Повтор запроса и перезапуск не создают повторный сигнал одного цикла. Существующие уведомления таймеров работают.

### Этап 5. Уведомления iPhone PWA

**Зависимости:** этап 4 и выбранная на этапе 0 инфраструктура.

**Задачи:** явное согласие, регистрация и отзыв push-подписки; защищённая серверная очередь с минимальными данными, условным обновлением версии, идемпотентностью и сроком актуальности. Проверка актуальности перед отправкой, ограниченные по времени повторы ошибок. Интеграция Web Push с существующим service worker без потери офлайн-работы и обновлений. Отдельные состояния ожидания сети и принятого сервером плана.

**Приёмка:** на физическом iPhone проверены установленная PWA, разрешение по действию пользователя, закрытое приложение, фокус, офлайн, задержанный push, отмена, истечение срока актуальности, отзыв подписки и открытие актуальной карточки. Проверены изоляция семей, отклонение чужого получателя и устаревшей версии. Ограничение отмены при отсутствии сети описано явно; постановка в очередь не называется подтверждённой доставкой.

### Этап 6. Семейная работа и сквозная приёмка

**Зависимость:** этап 5.

**Задачи:** реальная передача ребёнка между родителями на Android и iPhone; автоматический и ручной обмен, отставшая история и разные локальные прогнозы; одновременные изменения, повторные запросы, отключение получателя, смена семьи и отзыв устройства. Проверка всех критериев раздела 8. Пользовательская инструкция с ограничениями сети, доставки и приватности. Перед публикацией — процесс DEPLOY.md.

**Приёмка:** пройдены критерии раздела 8 и сценарий передачи между родителями. Не предполагается мгновенный ручной обмен или гарантированная доставка push. Результаты, ограничения и неподтверждённые сценарии записаны отдельно; артефакт сборки не считается завершённым развёртыванием.

Это интеграционная проверка семейных контрактов, уже заложенных на этапе 1, а не первое добавление семейной поддержки.

### Порядок сессий и граница готовности

- Каждая сессия получает номер этапа, зависимости, границы изменений и критерии приёмки из этого документа.
- Перед запуском следующей сессии проверяются результат, фактически выполненные проверки и блокеры предыдущей. Неуспешный этап не пропускается автоматически.
- После каждого этапа разработки выполняются TypeScript, production build и Vitest в порядке правил репозитория, а также smoke-проверка изменённого поведения. Для доставки обязательны реальные устройства. Для чистого исследования не приписываются несуществующие сборки и проверки.
- По завершении этапа фиксируются изменённые файлы, доказательства и открытые ограничения. Статус не меняется на «выполнен» только по факту запуска сессии.
- По указанию пользователя от 25 октября 2026 года после каждого принятого этапа создаются отдельный Git-коммит и push в текущую ветку. В коммит не включаются чужие staged-изменения, браузерные артефакты, секреты или незавершённые следующие этапы. При ошибке push фиксируется реальный блокер, без force-push и без объявления отправки успешной.
- На момент добавления этого требования этапы 0–3 уже реализованы общими изменениями файлов без промежуточных коммитов. Их согласованный результат фиксируется одним совокупным коммитом, без искусственного восстановления отдельных исторических этапов; незавершённые изменения этапа 4 остаются за его пределами.
- Вся связка считается завершённой только после этапа 6, включая Android и iPhone PWA.
- Ночные пробуждения, расширенная аналитика, контроль забытого таймера, ВОЗ-графики, достижения, занятия и библиотека — последующие отдельные задачи.

