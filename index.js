'use strict';

/**
 * This module represents the config.xml file.
 *
 * @author Sam Verschueren		<sam.verschueren@gmail.com>
 * @since  20 May 2015
 */

// module dependencies
var fs = require('fs');
var et = require('elementtree');
var pify = require('pify');
var Promise = require('pinkie-promise');

module.exports = (function () {
	var _this = {
		/**
		 * This method parses the xml file provided.
		 *
		 * @param  {string}	file		The XML file that should be parsed.
		 * @return {ElementTree}		The XML document.
		 */
		parse: function (file) {
			var contents = fs.readFileSync(file, 'utf-8');

			if (contents) {
				// Windows is the BOM. Skip the Byte Order Mark.
				contents = contents.substring(contents.indexOf('<'));
			}

			var doc = new et.ElementTree(et.XML(contents));
			var root = doc.getroot();

			if (root.tag !== 'widget') {
				// Throw an error if widget is not the root tag
				throw new Error(file + ' has incorrect root node name (expected "widget", was "' + root.tag + '")');
			}

			return doc;
		},

		/**
		 * Convert an absolute XPath expression to an equivalent expression relative to the root.
		 * This is required because node-elementtree does not support absolute XPath expressions.
		 *
		 * @param  {ElementTree}	doc	The ElementTree document that the XPath applies to.
		 * @param  {string}		xpath	An XPath expression that may be relative or absolute.
		 * @return {string}			A relative XPath expression.
		 */
		fixAbsoluteXPath: function(doc, path)
		{
			var prefix = '/' + doc.getroot().tag;

			if (path && path.indexOf(prefix) === 0)
			{
				path = path.replace(prefix, '.');
			}

			return path;
		}
	};

	/**
	 * Creates a new Config object.
	 *
	 * @param {string}	file		The path to the XML config file.
	 */
	function Config(file) {
		this._file = file;
		this._doc = _this.parse(file);
		this._root = this._doc.getroot();
	}

	/**
	 * Sets the ID of the config file.
	 *
	 * @param {string}	id			The ID of the config file.
	 */
	Config.prototype.setID = function (id) {
		var regex = new RegExp('^[0-9a-zA-Z]([-.\w]*[0-9a-zA-Z])*(:(0-9)*)*(\/?)([a-zA-Z0-9\-‌​\.\?\,\'\/\\\+&amp;%\$#_]*)?$');

		if (!regex.test(id)) {
			// If the id is not IRI, throw an error.
			throw new Error('Please provide a valid id.');
		}

		// Set the id of the widget tag
		this._root.attrib.id = id;
	};

	/**
	 * Sets the name tag of the config.xml file.
	 *
	 * @param {string}	name		The name of the config.xml name tag.
	 */
	Config.prototype.setName = function (name) {
		this.setElement('name', name);
	};

	/**
	 * Sets a named element in the config.xml file.
	 *
	 * @param {string}	tag			The config.xml tag to set
	 * @param {string}	[text]		The text to set
	 * @param {object}	[attribs] 	The attributes to set
	 */
	Config.prototype.setElement = function (tag, text, attribs) {
		if (typeof text === 'object') {
			attribs = text;
			text = '';
		}

		// find the tag
		var elementTag = this._doc.find('./' + tag);

		if (!elementTag) {
			// If no tag exists, create one
			elementTag = new et.Element(tag);

			// Add the tag to the root
			this._root.append(elementTag);
		}

		// set the text of the tag
		elementTag.text = text || '';

		elementTag.attrib = {};

		if (attribs !== undefined) {
			Object.keys(attribs).forEach(function (key) {
				elementTag.set(key, attribs[key]);
			});
		}
	};

	/**
	 * Sets the description tag of the config.xml file.
	 *
	 * @param {string}	description	The description of the config.xml description tag.
	 */
	Config.prototype.setDescription = function (description) {
		this.setElement('description', description);
	};

	/**
	 * Sets the author in the config file.
	 *
	 * @param {string}	name		The name of the author.
	 * @param {string}	[email]		The email address of the author.
	 * @param {string}	[website]	The website of the author.
	 */
	Config.prototype.setAuthor = function (name, email, website) {
		var attribs = {};

		if (email) {
			attribs.email = email;
		}

		if (website) {
			attribs.href = website;
		}

		this.setElement('author', name, attribs);
	};

	/**
	 * Sets the version of the config file.
	 *
	 * @param {string}	version		The version number.
	 */
	Config.prototype.setVersion = function (version) {
		var regex = new RegExp('^[0-9]+\.[0-9]+\.[0-9]+$');

		if (!regex.test(version)) {
			// If the version is not valid, throw an error.
			throw new Error('Please provide a valid version number.');
		}

		// Set the version of the widget tag
		this._root.attrib.version = version;
	};

	/**
	 * Sets the Android version code of the config file.
	 *
	 * @param {number}	versionCode	The android version code.
	 */
	Config.prototype.setAndroidVersionCode = function (versionCode) {
		var regex = new RegExp('^[0-9]+$');

		if (!regex.test(versionCode)) {
			// If the version is not valid, throw an error.
			throw new Error('Please provide a valid Android version code.');
		}

		// Set the version of the widget tag
		this._root.attrib['android-versionCode'] = versionCode;
	};

	/**
	 * Sets the iOS CFBundleVersion of the config file.
	 *
	 * @param {string}	version		The iOS CFBundleVersion.
	 */
	Config.prototype.setIOSBundleVersion = function (version) {
		var regex = new RegExp('^[1-9][0-9]*(\.[0-9]+){0,2}$');

		if (!regex.test(version)) {
			// If the version is not valid, throw an error.
			throw new Error('Please provide a valid iOS bundle version number.');
		}

		// Set the version of the widget tag
		this._root.attrib['ios-CFBundleVersion'] = version;
	};

	/**
	 * Adds or updates the preference `name` with the
	 * @param {string}	name		The name of the preference.
	 * @param {any}		value		The value of the preference.
	 * @param {string}	platform	(optional) The specific platform (e.g. 'ios' or 'android') to which the preference applies.
	 */
	Config.prototype.setPreference = function (name, value, platform) {
		// If a platform is specified, find the <platform /> element for that platform.
		var platformElement = platform ? this._doc.find('./platform/[@name="' + platform + '"]') : this._root;

		// If the platform element doesn't exist, create it.
		if (platformElement === null)
		{
			platformElement = new et.Element('platform');
			platformElement.attrib.name = platform;

			this._root.append(platformElement);
		}

		// Retrieve the correct preference
		var preference = platformElement.find('./preference/[@name="' + name + '"]');

		if (preference) {
			// If the preference already exists, remove it first
			this.platformElement.remove(preference);
		}

		// Create the preference element
		preference = new et.Element('preference');
		preference.attrib.name = name;
		preference.attrib.value = value;

		// Append the preference to the platform element
		this.platformElement.append(preference);
	};

	/**
	 * Removes all the <access /> tags out of the config file.
	 */
	Config.prototype.removeAccessOrigins = function () {
		// Find all the access tags and remove them
		this._doc.findall('./access').forEach(function (tag) {
			// Remove the tag
			this._root.remove(tag);
		}.bind(this));
	};

	/**
	 * Removes the access origin tag from the XML file if it exists.
	 *
	 * @param {string}	origin		The origin that should be removed.
	 */
	Config.prototype.removeAccessOrigin = function (origin) {
		var accessOrigin = this._doc.find('./access/[@origin="' + origin + '"]');

		if (accessOrigin) {
			// If the access tag exists, remove it
			this._root.remove(accessOrigin);
		}
	};

	/**
	 * Adds a new <access /> tag to the XML file. If an access tag with that origin
	 * already exist, it will be overwritten.
	 *
	 * @param {string}	origin		The origin of the access tag.
	 * @param {object}	[options]	Extra properties that should be added to the access tag.
	 */
	Config.prototype.setAccessOrigin = function (origin, options) {
		options = options || {};

		// Remove the origin if it already exists.
		this.removeAccessOrigin(origin);

		// Create an access tag
		var accessOrigin = new et.Element('access');
		accessOrigin.attrib.origin = origin;

		Object.keys(options).forEach(function (key) {
			// Iterate over the options object and add the properties
			accessOrigin.attrib[key] = options[key];
		});

		// Add the access tag to the root
		this._root.append(accessOrigin);
	};

	/**
	 * Adds the hook with type and src.
	 * see [Apache Cordova API Documentation](https://goo.gl/5QZlqu) for more info
	 *
	 * @param {string}	type		The cordova hook type.
	 * @param {string}	src			The source of the script.
	 */
	Config.prototype.addHook = function (type, src) {
		var cordovaHookTypes = [
			'after_build', 'after_compile', 'after_clean', 'after_docs', 'after_emulate',
			'after_platform_add', 'after_platform_rm', 'after_platform_ls', 'after_plugin_add',
			'after_plugin_ls', 'after_plugin_rm', 'after_plugin_search', 'after_plugin_install',
			'after_prepare', 'after_run', 'after_serve', 'before_build', 'before_clean',
			'before_compile', 'before_docs', 'before_emulate', 'before_platform_add',
			'before_platform_rm', 'before_platform_ls', 'before_plugin_add', 'before_plugin_ls',
			'before_plugin_rm', 'before_plugin_search', 'before_plugin_install',
			'before_plugin_uninstall', 'before_prepare', 'before_run', 'before_serve', 'pre_package'
		];

		if (cordovaHookTypes.indexOf(type) === -1) {
			throw new Error('Please provide a valid hook target');
		}

		// Create the hook element
		var hook = new et.Element('hook');
		hook.attrib.type = type;
		hook.attrib.src = src;

		// Append the hook to the root tag
		this._root.append(hook);
	};

	/**
	 * This method adds the raw XML provided to the config.xml file.
	 *
	 * @param {string}	raw			The raw XML that should be added to the config file.
	 * @param {string}	atXPath			(optional) This XPath expression will be used to locate the parent for the added element. The first match will be used.
	 *						If no matches are found, the element will not be added. If this parameter is not specified, the element will be added as a child of the root element.
	 * @param {string}	ifXPathDoesNotExist	(optional) If specified, this XPath expression will be checked for matches before adding the element. If any matches are found, the element will not be
	 *						added. This allows you to check whether the element you want to add has already been added.
	 */
	Config.prototype.addRawXML = function (raw, atXPath, ifXPathDoesNotExist) {
		atXPath = _this.fixAbsoluteXPath(this._doc, atXPath);
		ifXPathDoesNotExist = _this.fixAbsoluteXPath(this._doc, ifXPathDoesNotExist);

		var parent = atXPath ? this._doc.find(atXPath) : this._root;
		var alreadyExists = ifXPathDoesNotExist && this._doc.find(ifXPathDoesNotExist) !== null;

		if (parent !== null && !alreadyExists)
		{
			// Parse the raw XML
			var xml = et.XML(raw);

			// Append the XML
			parent.append(xml);
		}
	};

	/**
	 * Writes the config file async.
	 *
	 * @returns {Promise}			A promise that resolves when the file is written.
	 */
	Config.prototype.write = function () {
		return pify(fs.writeFile, Promise)(this._file, this._doc.write({indent: 4}), 'utf8');
	};

	/**
	 * The same as `write` but sync.
	 */
	Config.prototype.writeSync = function () {
		fs.writeFileSync(this._file, this._doc.write({indent: 4}), 'utf-8');
	};

	return Config;
})();
