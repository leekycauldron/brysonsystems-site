## Context
I've been using [OpenClaw](https://openclaw.ai/) and [Hermes Agent](https://hermes-agent.nousresearch.com/) a lot for the past few months. I've used it for many purposes: my personal research assistant, thinking partner for project/feature ideas, and running systems and routines in my personal life (reminder, fitness/nutrition & sleep analysis, daily language learning segments). One of the biggest problems I've run into when using these assistant harnesses, and what led me to build this project, is **memory**. Not just remembering how to do certain tasks or what technologies I prefer to use when building a project... but a real memory of me as a person: what I like to do, who my friends are, how I react to certain situations/information, certain events in my life that shape my current reasoning. 

Wouldn't it be cool to have an assistant that knows all that? That can make more informed decisions, better insights and overall *feel* like a true personal assistant? I was curious to see if an AI assistant that had that level of knowledge about me, would be able to assist me more.

The first approach was to write up a profile about me, my friends, family, hobbies, pet peeves etc. I quickly found the process too cumbersome and knew that there would be details about me that I would miss or get wrong, so I had to come up with something different.

Then I realized, so much of our life is documented through so many sources: journals, photos, text messages, and more recently AI conversations. What if I could take all that and have AI make connections across those sources to build one coherent profile of me?

I tried NotebookLM as I previously used it as a study tool to ingest information and turn it into quizzes and infographics. It failed miserably: large files were rejected, easily mixed up who said what in conversations, and answers degraded as the material grew.

## bio.md
bio.md is a local web app that takes in any source; no file size limit, all converted to plain text, and stores it locally three ways:
1. **Embeddings** chunked with a hard-cap (900 characters) and separated by natural boundaries (blank line, new line, end of sentence, space) with a rolling-window of 150 characters to capture any phrases or ideas that may be cut-off.
2. **Keyword Index** keeping track of each unique word and which chunk includes it
3. **Raw files** which can be used to extract direct quotes for citations

The web app is a simple three-pane interface with a chat, a place for imports, and the exported bio.md as well as a timeline view and open questions for gaps found in the sources. Using an agent, it synthesizes all these sources together to make a full and accurate profile of the user in the `bio.md` file.

### How it works

The agent, called biographer, takes these imports as puzzle pieces, each shedding some light about who the user (you) is. Each puzzle piece is analyzed, compared against other puzzle pieces, and eventually placed into the `bio.md`. Chat conversations to a friend, journal entries, AI conversations... they all reveal something about you: how you think, what you like or dislike, who your friends are to you. 

When trying to fit these pieces together, sometimes there is missing information. Our entire life doesn't happen online (although most of it does these days) some things are said in-person, some things were just thoughts we kept to ourselves, and so if the biographer detects any of these gaps it asks specific, clarifying questions for you to fill in those gaps.

## The unexpected, and sometimes scary, use case
Once I started to upload sources, the biographer started pointing out things about me that I didn't even know or realize about myself. 

Our view of ourselves can be biased by flawed memory, our ego and our emotions. When you upload a vast amount of information of yourself to a neutral AI and ask it to make connections and inferences across that information... it becomes sort of like a really clear mirror of who you are. There's no rationalization or justification of your actions, there are patterns in your speech and actions that you might not have realized that all come to light when you put it together and have it deeply analyzed. 

I was shocked when I read the patterns the biographer showed about me and it led me to a lot of deep self-reflection that honestly I don't think I could have achieved on my own. I would contradict myself a lot when talking to the same person, disguise emotionally-driven impulses as growth, and use internal anxieties & vague online signals to substitute confrontation.

We can tell ourselves lies to make us feel better, justify our actions to avoid accountability, or simply just ignore/avoid things that make us uncomfortable to think or talk about. By having this biographer bring all of it to light, it made me realize that this project could have more impact than simply having an AI know more about you. There could be real life use cases where someone could use this to synthesize their thoughts and emotions that were otherwise too complex or difficult to verbalize themselves. No AI could replace therapy, but I think this could be a possible tool where people can show others a deep and accurate "screenshot" of themselves that would otherwise be too overwhelming to create by themselves.

## Technical Stuff
Moving from the philosophical side of this project, there are some processes and features I want to talk about which made **bio.md** work so well.

### Ingestion
As mentioned before, all sources are converted to plain text, audio is transcribed, images are analyzed (codex only for now), and big files are split into chunks. 

During transcription, the app looks into `bio.md` and extract all the words that are capitalized, more than 3 letters long, and not in the exclude list of common words (The, His, From)... what's left is likely all the proper nouns like names and places that may have weird/unconventional spelling. These extracted words are then used to help the transcription with spelling.

### Storage
Everything is stored locally in a single SQLite file. There are five tables:

1. documents (these are the uploaded files converted to plain text, one row per file, contains stuff like upload datetime, size, path to the file, # of embedding chunks)
2. chunks (a 900-character-max piece from a document with reference to the file it's from and its position
3. chunks_fts (keyword index dictionary)
4. vectors (one row per chunk, with the vector embedding stored as bytes, the app loads all of them into one matrix in RAM and that's what queries get multiplied with)
5. meta (simply stores key value pair model: snowflake-arctic-embed-s)

### Retrieval
The agent uses several tools to search your entire corpus. The only thing in its context is the `bio.md`, the last few messages in the chat, and the latest message/question you asked it. It uses the content in `bio.md` to first get an idea of what you are asking (the `bio.md` is basically a summary of your huge database). It uses that information to write a query that gets embedded and matched against the vectors, grep to find every mention of a keyword, and read_source to read the entire source file of a chunk. 

The query embedding using a hybrid search, first finding chunks most related to the query semantically as well as finding chunks containing the exact keywords in the query (keywords are filtered through an exclude list of common words). These two lists are then ranked together, using reciprocal rank fusion, and returns one final chunk list where chunks appearing in both lists are given more weight.

Using these tools, it acts like a detective slowly uncovering a story, following new leads found in each tool call result that leads to another tool call until it's made all the connections it can to formulate an answer.

No matter how big that database is, the detective's context doesn't get bloated and remains the same with 10 files as with 10,000.

The whole "detective" loop is just the tool calls, returning the result and prompting the agent again. Once the agent returns plain text only the loop stops and the output is sent to chat.

To save context and keep the agent sharp, every turn only keeps the system prompt, the current state of `bio.md`, the tail of the chat, and the current user message. Tools and reasoning are not included and are thrown away in the next turn, with the final findings saved to the `bio.md`. 

#### Limits
Each turn has a budget to ensure it doesn't go too deep into any rabbit hole: 25 steps for chat, 40 for analysis, 60 for ingesting (more turns needed here since it ingests content of full raw files).

Reports are guaranteed. If the step budget was hit, it is forced to generate a report with the information it has. If it outputs incorrect tool schema, the error is fed back for it to self-fix.

Limits are adjustable but can increase usage.

### bio.md (the file)
The first run creates a skeleton for the file which is just a template for basic information like summary, identity, timeline, people & relationships, hypotheses, inferences (with confidence levels), open questions etc. 

The agent has one tool to edit the file: `edit_profile(old_text, new_text)`. If old_text is empty, it appends. If new_text is empty it removes old_text. old_text must match exactly what is in the file. Forcing surgical edits ensures that it doesn't accidentally rewrite/omit something by accident, compared to doing a full rewrite.

One outstanding issue I noticed: since it requires these precise edits, it doesn't look at the summary as a whole so there can be redundant information in multiple places and the summary isn't as coherent to read. Currently, I am thinking of doing a periodic (or manually activated) full pass that consolidates the whole file.

## Costs and privacy

Everything runs locally except the model calls. You bring an [OpenRouter](https://openrouter.ai/keys) key (any GPT, Claude, Gemini or open model, pay per use) or the OpenAI Codex CLI on a ChatGPT subscription. A researched reply costs tens of cents. Ingesting and processing the entire material might cost a few dollars. Your material, the index, the profile and the key stay on your machine; the model only sees the profile, recent messages, and the excerpts the agent pulls while researching.

## Try it

```
git clone https://github.com/leekycauldron/bio.md && cd bio.md
./setup.sh && ./run.sh     # Windows: .\setup.ps1 then .\run.ps1
```

There are instructions in the README as well as in the app on how to export iMessages and Instagram DMs. iMessage export on windows was a bit of a pain, if enough people seem to run into this issue I'll put a video tutorial.

Drop in your files, watch it read, and see what it says about you.

If you like it or have critique/suggestions, let me know: bryson@brysonsystems.ca
