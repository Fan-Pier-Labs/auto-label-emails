# Email Auto-Labeling Service

## to do

- [X] when deploying to aws, we should store the refresh token in aws secrets manager

- [ ] also add the ability to enable/disable the deterministic rules from the spread sheet as well. we can use columns F:G

- [ ] add ananlytics with amplitude so we can see usage. make sure to record user's emails and names and usage (eg labeled 10 emails at 10am for user X with email x@gmail.com). Don't record the contents or titles of the emails. Send this data to amplitude where we can have some charts to see this. You can set up an amplitude account and make me the owner of it. 

- [ ] make a splash page with v0. I can host it on my aws. 
- [ ] make a tutorial video that people can follow to set it up themselves. this can be: 
  - [ ] 1. the user will go into google cloud and make a oauth client
  - [ ] 2. the user will add the oauth json to this folder
  - [ ] 3. the user will run get-token.ts locally to get a google refresh token (the code should add this to some file that is included in the deploy, or upload it to aws secrets manager automatically, etc )
  - [ ] 4. the user deploys the code somewhere with docker
  - [ ] (i think it is best if i make the video, but if you guys can iron out the details that would be great)
- [ ] also iron out the deployment steps a bit and test the code yourself - try a few different models, the llama3.2:3b was working well, but it is huge and slow. Maybe something else would be better. mabye try R1 1776 ? of course we should support just using api calls to openai/etc as well. personally i dont really want to send all my email to open ai but others may be open to that. 
- [ ] also, add fan pier labs branding throughout the project 
- [ ] also refactor this so it will list emails that need processing then for each {fetch the email, process it, continue}. right now it lists all, fetches all, processes all
- [ ] also do some testing to ensure quality - the llama 1b model was pretty bad so i upped to the 3b which was really slow on my mac


## wishlist 
- [ ] make a cool video with remotion.dev  for the  v0 site (maybe? just if its easy. we could have a video of labels being applied to an inbox with fake emails. we could have the fake emails be funny as well.)