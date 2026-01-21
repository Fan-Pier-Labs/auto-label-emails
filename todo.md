# Email Auto-Labeling Service

## todo

i need to upload the refresh token (in .env) to aws secret manager and set up a secret 

and then this should work

also i want to make a template google sheet that people can copy during the setup

also change the __processed__ label so the ids just live in ram, and it doens't add that label.  DONE

todo to get it live is basically
- add ananlytics with amplitude so we can see usage
- make a splash page with v0
- make a cool video with remotion.dev 


also refactor this so it will list emails that need processing then for each (fetch the email, process it, continue). right now it lists all, fetches all, processes all


ensure that it uses different llm calls for each label.

also do some testing to ensure quality - the llama 1b model was pretty bad so i upped to the 3b which was really slow on my mac
