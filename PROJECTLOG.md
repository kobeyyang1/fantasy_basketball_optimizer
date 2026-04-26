# Project Log

This log records the development of the Fantasy Basketball Lineup Optimiser and Performance Predictor over 16 weeks. It is intended to show weekly planning, a record of progress, use of source control, and ongoing reflection on what changed during the project.

## How I Used This Log

- At the start of each week I set a rough target for what I wanted to get done.
- During or after that week I updated the log to record what I actually finished, what changed, and what still needed work.
- I used Git throughout the project so changes to the backend, frontend, scripts, and documentation were recorded incrementally instead of being left until the end.
- This log works alongside the repository history. The commits show the changes themselves; the log explains the reasoning, priorities, and lessons learned.

## Source Control Approach

- The whole project was developed in a Git repository rather than being kept as separate local copies.
- I pushed work regularly and treated the repository as the main record of development.
- I tried to keep changes grouped by feature or area of work, for example backend services, API routes, React pages, scripts, or documentation.
- Documentation such as `README.md` and this log was updated alongside the code rather than being written only at the end.
- Non-essential generated files were not the focus of the repository; the aim was to keep the history centred on actual project work.

## Week 1 [w/c 15 Dec 2025]

**Plan for the week**

- Settle on a final project direction.
- Break the idea down into parts that were realistic to build.

**What I did**

- Decided to focus on a fantasy basketball tool rather than a more generic sports analytics dashboard.
- Split the project into core areas: data collection, backend API, optimisation logic, machine learning prediction, and frontend UI.
- Started thinking about what data would be needed for this to work properly, especially player stats, season data, and roster-related information.

**Source control / project record**

- Set up the repository as the main working space for the project.
- Started with a structure that would let the backend and frontend grow separately without becoming messy.

**Reflection**

- This was mostly a planning week, but it was important because it stopped the project from becoming too broad too early.
- Next week needed to be more concrete: project structure, models, and basic setup.

## Week 2 [w/c 22 Dec 2025]

**Plan for the week**

- Get the main project structure in place.
- Start the backend and frontend foundations.

**What I did**

- Set up the FastAPI backend and React frontend.
- Started the main database models for players, users, saved items, and season stats.
- Sketched out how frontend pages would eventually talk to the backend so I would not have to redesign that part later.

**Source control / project record**

- Organised the repo into `app/` and `fantasy-frontend/`, which helped keep the project clearer from the start.
- This also meant later commits could stay more focused by area.

**Reflection**

- This week was not flashy, but it made the later work much easier.
- The next obvious task was importing real data, because the rest of the system depends on that.

## Week 3 [w/c 29 Dec 2025]

**Plan for the week**

- Start bringing player and season data into the database.
- Check if the imported data was actually usable.

**What I did**

- Worked on import services for players, teams, positions, and season statistics.
- Added and refined scripts for importing and refreshing NBA-related data.
- Spent time checking for naming inconsistencies and incomplete records.

**Source control / project record**

- Most of the work this week was in backend services and scripts, which is reflected in the repository structure.
- Keeping imports in separate files made it easier to adjust them without affecting route logic.

**Reflection**

- Data quality became a bigger issue than I expected. It was clear that bad inputs would cause problems much later in the project if I ignored them now.
- Next week I wanted to start using this data for actual fantasy outputs.

## Week 4 [w/c 5 Jan 2026]

**Plan for the week**

- Start building fantasy-specific backend logic.
- Expose some early outputs through API routes.

**What I did**

- Added projection and ranking-related backend logic, including risk-oriented calculations.
- Began creating API routes for fantasy outputs and player data responses.
- Tested route responses manually and corrected field mismatches between services, models, and route outputs.

**Source control / project record**

- Changes were mostly in backend modules, especially routes and fantasy logic.
- This made it easier to separate business logic from data import work already done in the previous weeks.

**Reflection**

- Manual testing helped a lot here because several issues only showed up once the backend started returning full responses.
- The next step was to get the frontend connected to real data instead of working only in the backend.

## Week 5 [w/c 12 Jan 2026]

**Plan for the week**

- Build the first useful frontend screens.
- Connect frontend views to live backend data.

**What I did**

- Built early frontend pages and linked them to backend endpoints.
- Added a dashboard-style view for looking through player information.
- Improved the layout so the project felt less like a prototype and more like an actual application.

**Source control / project record**

- Frontend pages, components, and API helper code started to grow properly this week.
- UI work stayed separate from backend changes, which made the project history easier to follow.

**Reflection**

- This was the point where the project started to feel real.
- It also exposed usability issues that I would not have noticed from API testing alone.

## Week 6 [w/c 19 Jan 2026]

**Plan for the week**

- Improve the dashboard and make it easier to use with larger datasets.

**What I did**

- Added player search and improved how larger player lists were handled.
- Continued cleaning up layout and presentation across the frontend.
- Spent more time on usability this week than on adding completely new features.

**Source control / project record**

- Most changes were small but frequent, which is exactly where source control was useful.
- Instead of one large UI change, the work happened across components and page-level refinements.

**Reflection**

- This week did not change the project dramatically, but it did make it much easier to use.
- I felt more confident moving on to the optimiser once the data browsing experience was less awkward.

## Week 7 [w/c 26 Jan 2026]

**Plan for the week**

- Begin the line-up optimiser.
- Check whether the outputs made sense from a fantasy basketball point of view.

**What I did**

- Started building the optimisation workflow.
- Added support for suggested or constructed line-ups.
- Spent time comparing outputs against what I would reasonably expect from basketball knowledge, rather than just accepting the first working result.

**Source control / project record**

- Optimiser-related work was kept in the fantasy logic and planner-related frontend code.
- This made the shift from simple stats display to actual decision support visible in the repo.

**Reflection**

- This was an important week because the project moved from showing data to actually doing something with it.
- The next gap was user-specific behaviour, especially if I wanted saved features to matter.

## Week 8 [w/c 2 Feb 2026]

**Plan for the week**

- Add authentication.
- Start making the system feel more personalised.

**What I did**

- Added login and registration flows.
- Connected frontend auth pages to backend authentication routes.
- Improved the overall structure so saved or user-specific features would make more sense going forward.

**Source control / project record**

- Auth work touched both backend and frontend, but in a fairly controlled way through dedicated route and page files.
- This is the kind of cross-cutting work where regular commits were useful because it was easy to break the flow between frontend and backend.

**Reflection**

- Authentication was a good milestone because it made the app feel less like a demo.
- The next thing I needed to improve was explainability, because not every result is useful if the user cannot understand it.

## Week 9 [w/c 9 Feb 2026]

**Plan for the week**

- Improve explainability.
- Make rankings and scores easier to understand from the UI.

**What I did**

- Expanded the explainability side of the frontend.
- Improved the modal and surrounding interaction so users could inspect why a player looked strong or weak.
- Thought more carefully about the difference between giving a score and actually helping the user interpret it.

**Source control / project record**

- Most work was in frontend explainability pages and supporting logic rather than in the underlying scoring itself.
- This kept presentation changes separate from the core ranking calculations.

**Reflection**

- I realised this week that clarity matters almost as much as accuracy in a project like this.
- Next I wanted to improve the first-use experience, because some pages still felt abrupt.

## Week 10 [w/c 16 Feb 2026]

**Plan for the week**

- Make the app easier to approach for a first-time user.

**What I did**

- Added a landing page.
- Added small help cues such as hover notes.
- Looked at the application more as a complete user flow instead of a set of separate screens.

**Source control / project record**

- This week was mainly frontend and documentation-oriented.
- The repository history should show smaller UI and navigation changes rather than one major backend feature.

**Reflection**

- The app started to feel more coherent after this.
- It still needed better support inside the app itself, which led into the next week.

## Week 11 [w/c 23 Feb 2026]

**Plan for the week**

- Improve help and continue refining draft-related tools.

**What I did**

- Added a dedicated help page.
- Continued improving the draft planner and related interactions.
- Made several smaller usability fixes after testing how the pages actually felt in use.

**Source control / project record**

- This week is a good example of incremental work that probably looks small in isolation but mattered a lot overall.
- Source control helped keep that steady improvement visible instead of it being forgotten as "minor changes".

**Reflection**

- Some of the best improvements this week were the least dramatic ones.
- The next issue I needed to revisit was data quality, especially around current-season and active-player handling.

## Week 12 [w/c 2 Mar 2026]

**Plan for the week**

- Improve current-season accuracy.
- Make player availability logic more reliable.

**What I did**

- Added support for the current season.
- Updated player movement handling to better reflect offseason changes.
- Improved active-player logic so the system could better decide who should actually appear as available.

**Source control / project record**

- Most work was in backend scripts and services rather than visible UI.
- This kind of change is exactly why keeping a project log matters, because it was important work even though it was less obvious from the interface.

**Reflection**

- Better inputs made a visible difference to the outputs, which was reassuring.
- I was reminded again that data maintenance can be just as important as feature work.

## Week 13 [w/c 9 Mar 2026]

**Plan for the week**

- Expand the draft planner into a more interactive mock draft tool.

**What I did**

- Added mock draft functionality and tied it in more closely with the draft planner.
- Improved the surrounding UI so the feature was easier to test and demonstrate.
- This pushed the project further toward being an interactive fantasy tool rather than just an analysis page.

**Source control / project record**

- Draft-related changes were mostly contained to the planner side of the frontend.
- The commit history for this stage should show a clear continuation of the planning/draft workflow.

**Reflection**

- This was useful progress, but it also made the project more complicated to test because more features were now interacting with each other.
- I expected bug fixing and guidance work to take up more time after this.

## Week 14 [w/c 16 Mar 2026]

**Plan for the week**

- Improve onboarding.
- Fix issues that showed up once newer features were used together.

**What I did**

- Added a guided tour for the main pages and controls.
- Improved the mock draft interface.
- Fixed bugs found while testing how the newer parts of the system worked together.

**Source control / project record**

- This week included both usability changes and bug fixes, which is a normal late-stage development pattern.
- Git was useful here because several fixes were small and spread across different files.

**Reflection**

- Integrated testing exposed problems that isolated testing had not.
- That was frustrating at times, but it was useful because it caught issues before the final stage.

## Week 15 [w/c 23 Mar 2026]

**Plan for the week**

- Properly evaluate the machine learning side of the project.
- Produce outputs that could support the final report.

**What I did**

- Generated model evaluation artefacts.
- Compared Linear Regression and Random Forest using historical season data.
- Collected outputs such as metrics, prediction comparisons, SHAP visualisations, and response-time results.

**Source control / project record**

- Evaluation code and artefacts were stored in the machine learning section of the repository.
- Keeping them alongside the rest of the project helped link the written analysis back to actual implementation work.

**Reflection**

- This week helped the project academically as much as technically.
- It made it easier to justify model choices instead of just describing them.

## Week 16 [w/c 30 Mar 2026]

**Plan for the week**

- Final system review.
- Polish the project and make sure it was ready for submission and demonstration.

**What I did**

- Carried out final cleanup across backend and frontend.
- Reviewed refresh scripts, routes, optimiser flow, explainability outputs, draft tools, and navigation.
- Updated supporting documentation so the project was easier to run and explain.

**Source control / project record**

- Final work included cleanup, documentation, and smaller corrections rather than major new features.
- The repository at this stage acts as a full record of the project rather than just a storage location for final files.

**Reflection**

- Looking back, the best parts of the project came from steady iteration rather than one big breakthrough.
- If I had more time, I would focus on more automated testing, further optimiser evaluation, and improving resilience around live data updates.

## Overall Reflection

- The project developed in a clear sequence: setup, data import, backend logic, frontend integration, fantasy features, evaluation, and final polish.
- Weekly planning helped keep the scope under control, even when priorities shifted.
- Using Git consistently was important for tracking progress and managing changes across different parts of the project.
- The log also shows that progress was not just about adding new features. In several weeks the main work was refinement, testing, data quality, or making the system easier to understand.
