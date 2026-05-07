# Google Drive для AI-BOSS MVP

MVP-подключение работает через service account и одну расшаренную папку Google Drive.

## Как подготовить Google Drive

1. Создать service account в Google Cloud.
2. Включить Google Drive API в проекте Google Cloud.
3. Создать JSON key для service account.
4. На Google Drive создать корневую папку, например `AI-BOSS Companies`.
5. Расшарить эту папку на email service account с правом `Viewer`.
6. Внутри папки создать подпапки по компаниям. Название подпапки должно совпадать с названием компании в Telegram:
   - `Альфа Балт Сервис`
   - `Компания 2`
   - `Компания 3`

Если `GOOGLE_DRIVE_FOLDER_ID` указывает сразу на папку конкретной компании, AI-BOSS прочитает эту папку напрямую, если её название совпадает с названием компании. Это удобно для одного кейса, например `Селедчик консалтинг`.

## Переменные окружения

Добавить в Vercel:

```env
GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL=service-account@project.iam.gserviceaccount.com
GOOGLE_DRIVE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GOOGLE_DRIVE_FOLDER_ID=google_drive_root_folder_id
GOOGLE_DRIVE_MAX_TEXT_CHARS=120000
```

`GOOGLE_DRIVE_FOLDER_ID` берётся из URL папки:

```text
https://drive.google.com/drive/folders/<GOOGLE_DRIVE_FOLDER_ID>
```

## Как пользоваться в Telegram

1. Выбрать компанию:

```text
/use Альфа Балт Сервис
```

2. Подтянуть документы:

```text
/drive
```

AI-BOSS найдёт подпапку `Альфа Балт Сервис`, прочитает Google Docs / Sheets / text / CSV и сохранит документы как источники компании.

3. Запустить анализ:

```text
/analyze
```

## Что читается в MVP

Читается как текст:

- Google Docs
- Google Sheets
- Google Slides
- `.txt`
- `.csv`
- `.md`
- `.json`

PDF, изображения и сложные офисные файлы пока сохраняются как ссылки. Их текстовое извлечение лучше добавить отдельным этапом.

## Быстрый вариант без полной интеграции

Если нужно добавить один Google Doc или Google Sheet, можно не настраивать service account:

1. Открыть доступ к файлу: `Все, у кого есть ссылка, могут просматривать`.
2. В Web открыть компанию.
3. Нажать `Добавить источник`.
4. Вставить ссылку на конкретный Google Doc / Sheet.

AI-BOSS попробует вытащить текст из публичной ссылки и использовать его в следующем анализе. Папки целиком таким способом не обходятся: для массовой синхронизации нужна service account-интеграция.
