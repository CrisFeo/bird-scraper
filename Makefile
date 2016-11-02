.PHONY: setup
setup:
	. $(NVM_DIR)/nvm.sh && nvm use
	npm install
