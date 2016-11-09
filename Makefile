JSCTAGS=node_modules/.bin/jsctags

SRC_JS=index.js

.PHONY: setup
setup:
	. $(NVM_DIR)/nvm.sh && nvm use
	npm install

tags: $(SRC_JS)
	$(JSCTAGS) $(SRC_JS) -f | sed '/^$$/d' | sort > $@
