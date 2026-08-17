// Canonieke 28-categorieen materiaaldata (icoon-URLs, NL/FR-namen).
// Zelfde bron als backend/material_categories.json — hou beide gesynchroniseerd.
export const MATERIAL_CATEGORIES = [
  {
    "key": "hout",
    "nl": "Hout",
    "fr": "Bois",
    "icon": "https://res.cloudinary.com/dbjizykvb/image/upload/v1786751151/hout_wtgcfe.png",
    "subcategories": [
      {
        "key": "plank",
        "nl": "Plank",
        "fr": "Planche"
      },
      {
        "key": "paneel_mdf",
        "nl": "Paneel mdf",
        "fr": "Panneau MDF"
      },
      {
        "key": "paneel_betonplex",
        "nl": "Paneel betonplex",
        "fr": "Panneau bétonplex"
      },
      {
        "key": "paneel_osb",
        "nl": "Paneel osb",
        "fr": "Panneau OSB"
      },
      {
        "key": "paneel_multiplex",
        "nl": "Paneel Multiplex",
        "fr": "Panneau contreplaqué"
      },
      {
        "key": "balk_klein_1m",
        "nl": "Balk klein (<1m)",
        "fr": "Petite poutre (<1 m)"
      },
      {
        "key": "balk_groot_1m",
        "nl": "Balk groot (>1m)",
        "fr": "Grande poutre (>1 m)"
      }
    ]
  },
  {
    "key": "elektriciteit",
    "nl": "Elektriciteit",
    "fr": "Électricité",
    "icon": "https://res.cloudinary.com/dbjizykvb/image/upload/v1786751139/electriciteit_gnr9qx.png",
    "subcategories": [
      {
        "key": "stekkers",
        "nl": "Stekkers",
        "fr": "Prises"
      },
      {
        "key": "multiprises",
        "nl": "Multiprises",
        "fr": "Multiprises"
      },
      {
        "key": "schakelaars",
        "nl": "Schakelaars",
        "fr": "Interrupteurs"
      },
      {
        "key": "kabel",
        "nl": "Kabel",
        "fr": "Câbles"
      },
      {
        "key": "kabelgoten",
        "nl": "Kabelgoten",
        "fr": "Goulottes"
      },
      {
        "key": "zekeringen",
        "nl": "Zekeringen",
        "fr": "Fusibles"
      },
      {
        "key": "dozen",
        "nl": "Dozen",
        "fr": "Boîtes"
      }
    ]
  },
  {
    "key": "meubels",
    "nl": "Meubels",
    "fr": "Mobilier",
    "icon": "https://res.cloudinary.com/dbjizykvb/image/upload/v1786751162/meubel_g9fjla.png",
    "subcategories": [
      {
        "key": "tafel",
        "nl": "Tafel",
        "fr": "Table"
      },
      {
        "key": "bed",
        "nl": "Bed",
        "fr": "Lit"
      },
      {
        "key": "locker",
        "nl": "Locker",
        "fr": "Casier"
      },
      {
        "key": "kast",
        "nl": "Kast",
        "fr": "Armoire"
      },
      {
        "key": "stoel",
        "nl": "Stoel",
        "fr": "Chaise"
      },
      {
        "key": "bureaustoel",
        "nl": "Bureaustoel",
        "fr": "Chaise de bureau"
      },
      {
        "key": "bank",
        "nl": "Bank",
        "fr": "Banc"
      },
      {
        "key": "sofa",
        "nl": "Sofa",
        "fr": "Canapé"
      },
      {
        "key": "kapstok",
        "nl": "Kapstok",
        "fr": "Porte-manteau"
      },
      {
        "key": "tafelvoet",
        "nl": "Tafelvoet",
        "fr": "Pied de table"
      }
    ]
  },
  {
    "key": "sanitair",
    "nl": "Sanitair",
    "fr": "Sanitaire",
    "icon": "https://res.cloudinary.com/dbjizykvb/image/upload/v1786751170/sanitair_glqjzr.png",
    "subcategories": [
      {
        "key": "douche",
        "nl": "Douche",
        "fr": "Douche"
      },
      {
        "key": "lavabo",
        "nl": "Lavabo",
        "fr": "Lavabo"
      },
      {
        "key": "toilet",
        "nl": "Toilet",
        "fr": "Toilette"
      },
      {
        "key": "toilet_bak",
        "nl": "Toilet bak",
        "fr": "Réservoir de toilette"
      },
      {
        "key": "urinoir",
        "nl": "Urinoir",
        "fr": "Urinoir"
      },
      {
        "key": "hulpstukken",
        "nl": "Hulpstukken",
        "fr": "Raccords"
      }
    ]
  },
  {
    "key": "verlichting",
    "nl": "Verlichting",
    "fr": "Éclairage",
    "icon": "https://res.cloudinary.com/dbjizykvb/image/upload/v1786751182/verlichting_syay6e.png",
    "subcategories": [
      {
        "key": "armatuur",
        "nl": "Armatuur",
        "fr": "Luminaire"
      },
      {
        "key": "tl_armaturen",
        "nl": "TL armaturen",
        "fr": "Armatures fluorescentes"
      },
      {
        "key": "lamp",
        "nl": "Lamp",
        "fr": "Lampe"
      },
      {
        "key": "schakelaar",
        "nl": "Schakelaar",
        "fr": "Interrupteur"
      }
    ]
  },
  {
    "key": "keuken",
    "nl": "Keuken",
    "fr": "Cuisine",
    "icon": "https://res.cloudinary.com/dbjizykvb/image/upload/v1786751159/Keuken_cc8rd1.png",
    "subcategories": [
      {
        "key": "bestek",
        "nl": "Bestek",
        "fr": "Couverts"
      },
      {
        "key": "borden",
        "nl": "Borden",
        "fr": "Assiettes"
      },
      {
        "key": "tassen",
        "nl": "Tassen",
        "fr": "Tasses"
      },
      {
        "key": "glazen",
        "nl": "Glazen",
        "fr": "Verres"
      },
      {
        "key": "kookgerij",
        "nl": "Kookgerij",
        "fr": "Ustensiles de cuisine"
      }
    ]
  },
  {
    "key": "huishoudelijke_apparaten",
    "nl": "Huishoudelijke apparaten",
    "fr": "Appareils ménagers",
    "icon": "https://res.cloudinary.com/dbjizykvb/image/upload/v1786751154/huishoudelijke_apparaten_mnrzvs.png",
    "subcategories": [
      {
        "key": "boiler",
        "nl": "Boiler",
        "fr": "Chauffe-eau"
      },
      {
        "key": "oven",
        "nl": "Oven",
        "fr": "Four"
      },
      {
        "key": "mixer",
        "nl": "Mixer",
        "fr": "Mixeur"
      },
      {
        "key": "dampkap",
        "nl": "Dampkap",
        "fr": "Hotte"
      },
      {
        "key": "microgolf",
        "nl": "Microgolf",
        "fr": "Micro-ondes"
      },
      {
        "key": "vaatwasmachine",
        "nl": "Vaatwasmachine",
        "fr": "Lave-vaisselle"
      },
      {
        "key": "wasmachine",
        "nl": "Wasmachine",
        "fr": "Machine à laver"
      },
      {
        "key": "droogkast",
        "nl": "Droogkast",
        "fr": "Sèche-linge"
      },
      {
        "key": "fornuis_gas",
        "nl": "Fornuis (gas)",
        "fr": "Cuisinière (gaz)"
      },
      {
        "key": "fornuis_elektrisch",
        "nl": "Fornuis (elektrisch)",
        "fr": "Cuisinière (électrique)"
      },
      {
        "key": "frigo",
        "nl": "Frigo",
        "fr": "Réfrigérateur"
      },
      {
        "key": "diepvries",
        "nl": "Diepvries",
        "fr": "Congélateur"
      }
    ]
  },
  {
    "key": "vloer",
    "nl": "Vloer",
    "fr": "Sol",
    "icon": "https://res.cloudinary.com/dbjizykvb/image/upload/v1786751187/vloer_juk4wx.png",
    "subcategories": [
      {
        "key": "hout",
        "nl": "Hout",
        "fr": "Bois"
      },
      {
        "key": "lino",
        "nl": "Lino",
        "fr": "Lino"
      },
      {
        "key": "tegels",
        "nl": "Tegels",
        "fr": "Carrelage"
      },
      {
        "key": "tapijt",
        "nl": "Tapijt",
        "fr": "Moquette"
      }
    ]
  },
  {
    "key": "ijzerwaren",
    "nl": "IJzerwaren",
    "fr": "Quincaillerie métallique",
    "icon": "https://res.cloudinary.com/dbjizykvb/image/upload/v1786751156/ijzer_hqf6ag.png",
    "subcategories": [
      {
        "key": "buizen",
        "nl": "Buizen",
        "fr": "Tuyaux"
      },
      {
        "key": "kokers",
        "nl": "Kokers",
        "fr": "Profilés creux"
      },
      {
        "key": "steunbalken",
        "nl": "Steunbalken",
        "fr": "Poutres de soutien"
      },
      {
        "key": "plaatmateriaal",
        "nl": "Plaatmateriaal",
        "fr": "Tôles et plaques"
      },
      {
        "key": "quincaillerie",
        "nl": "Quincaillerie",
        "fr": "Quincaillerie"
      }
    ]
  },
  {
    "key": "tuin",
    "nl": "Tuin",
    "fr": "Jardin",
    "icon": "https://res.cloudinary.com/dbjizykvb/image/upload/v1786751177/tuin_hqdd3r.png",
    "subcategories": [
      {
        "key": "aarde",
        "nl": "Aarde",
        "fr": "Terre"
      },
      {
        "key": "gereedschap_tuin",
        "nl": "Gereedschap (tuin)",
        "fr": "Outils de jardinage"
      },
      {
        "key": "potten",
        "nl": "Potten",
        "fr": "Pots"
      },
      {
        "key": "valse_planten",
        "nl": "Valse planten",
        "fr": "Plantes artificielles"
      },
      {
        "key": "planten",
        "nl": "Planten",
        "fr": "Plantes"
      }
    ]
  },
  {
    "key": "spiegel",
    "nl": "Spiegel",
    "fr": "Miroir",
    "icon": "https://res.cloudinary.com/dbjizykvb/image/upload/v1786751171/spiegel_olblaw.png",
    "subcategories": []
  },
  {
    "key": "plastiek",
    "nl": "Plastiek",
    "fr": "Plastique",
    "icon": "https://res.cloudinary.com/dbjizykvb/image/upload/v1786751167/plastic_nrxubs.png",
    "subcategories": [
      {
        "key": "bache",
        "nl": "Bâche",
        "fr": "Bâche"
      },
      {
        "key": "plexiglas",
        "nl": "Plexiglas",
        "fr": "Plexiglas"
      },
      {
        "key": "polycarbonaat",
        "nl": "Polycarbonaat",
        "fr": "Polycarbonate"
      }
    ]
  },
  {
    "key": "textiel",
    "nl": "Textiel",
    "fr": "Textile",
    "icon": "https://res.cloudinary.com/dbjizykvb/image/upload/v1786751174/textiel_rozyh6.png",
    "subcategories": [
      {
        "key": "stof",
        "nl": "Stof",
        "fr": "Tissu"
      },
      {
        "key": "gordijnen",
        "nl": "Gordijnen",
        "fr": "Rideaux"
      }
    ]
  },
  {
    "key": "opkuis",
    "nl": "Opkuis",
    "fr": "Nettoyage",
    "icon": "https://res.cloudinary.com/dbjizykvb/image/upload/v1786751164/opkuis_ppbqeq.png",
    "subcategories": [
      {
        "key": "kuisgereedschap",
        "nl": "Kuisgereedschap",
        "fr": "Matériel de nettoyage"
      },
      {
        "key": "kuisproducten",
        "nl": "Kuisproducten",
        "fr": "Produits de nettoyage"
      }
    ]
  },
  {
    "key": "papier",
    "nl": "Papier",
    "fr": "Papier",
    "icon": "https://res.cloudinary.com/dbjizykvb/image/upload/v1786751165/papier_wubvbe.png",
    "subcategories": [
      {
        "key": "print_papier",
        "nl": "Print papier",
        "fr": "Papier d'impression"
      },
      {
        "key": "grote_vellen_papier",
        "nl": "Grote vellen papier",
        "fr": "Grandes feuilles de papier"
      },
      {
        "key": "knutsel_papier",
        "nl": "Knutsel papier",
        "fr": "Papier de bricolage"
      }
    ]
  },
  {
    "key": "telecom",
    "nl": "Tele-com",
    "fr": "Télécom",
    "icon": "https://res.cloudinary.com/dbjizykvb/image/upload/v1786751173/Telecom_jwxdpi.png",
    "subcategories": [
      {
        "key": "wifi_kabel",
        "nl": "Wifi kabel",
        "fr": "Câble Wi-Fi"
      },
      {
        "key": "wifi_modem",
        "nl": "Wifi modem",
        "fr": "Modem Wi-Fi"
      },
      {
        "key": "pc",
        "nl": "PC",
        "fr": "PC"
      },
      {
        "key": "laptop",
        "nl": "Laptop",
        "fr": "Ordinateur portable"
      },
      {
        "key": "telefoon",
        "nl": "Telefoon",
        "fr": "Téléphone"
      }
    ]
  },
  {
    "key": "video",
    "nl": "Video",
    "fr": "Vidéo",
    "icon": "https://res.cloudinary.com/dbjizykvb/image/upload/v1786751183/video_sfwad9.png",
    "subcategories": [
      {
        "key": "projectiescherm",
        "nl": "Projectiescherm",
        "fr": "Écran de projection"
      },
      {
        "key": "scherm",
        "nl": "Scherm",
        "fr": "Écran"
      },
      {
        "key": "projector",
        "nl": "Projector",
        "fr": "Projecteur"
      },
      {
        "key": "dvd_speler",
        "nl": "Dvd speler",
        "fr": "Lecteur DVD"
      },
      {
        "key": "hdmi_kabel",
        "nl": "HDMI kabel",
        "fr": "Câble HDMI"
      }
    ]
  },
  {
    "key": "audio",
    "nl": "Audio",
    "fr": "Audio",
    "icon": "https://res.cloudinary.com/dbjizykvb/image/upload/v1786751139/audio_qz21jq.png",
    "subcategories": [
      {
        "key": "radio",
        "nl": "Radio",
        "fr": "Radio"
      },
      {
        "key": "boxen",
        "nl": "Boxen",
        "fr": "Haut-parleurs"
      },
      {
        "key": "kabels",
        "nl": "Kabels",
        "fr": "Câbles"
      },
      {
        "key": "versterker",
        "nl": "Versterker",
        "fr": "Amplificateur"
      },
      {
        "key": "draaitafel",
        "nl": "Draaitafel",
        "fr": "Platine vinyle"
      }
    ]
  },
  {
    "key": "bouwmateriaal",
    "nl": "Bouwmateriaal",
    "fr": "Matériaux de construction",
    "icon": "https://res.cloudinary.com/dbjizykvb/image/upload/v1786751138/bouwmateriaal_khigbq.png",
    "subcategories": [
      {
        "key": "ytong",
        "nl": "Ytong",
        "fr": "Ytong"
      },
      {
        "key": "bakstenen",
        "nl": "Bakstenen",
        "fr": "Briques"
      },
      {
        "key": "gyproc",
        "nl": "Gyproc",
        "fr": "Gyproc"
      },
      {
        "key": "zand",
        "nl": "Zand",
        "fr": "Sable"
      }
    ]
  },
  {
    "key": "isolatie",
    "nl": "Isolatie",
    "fr": "Isolation",
    "icon": "https://res.cloudinary.com/dbjizykvb/image/upload/v1786751157/isolatie_qydmt7.png",
    "subcategories": [
      {
        "key": "isolatie_platen",
        "nl": "Isolatie platen",
        "fr": "Panneaux isolants"
      },
      {
        "key": "isolatie_wol",
        "nl": "Isolatie wol",
        "fr": "Laine isolante"
      }
    ]
  },
  {
    "key": "raam",
    "nl": "Raam",
    "fr": "Fenêtre",
    "icon": "https://res.cloudinary.com/dbjizykvb/image/upload/v1786751168/raam_olfzb5.png",
    "subcategories": []
  },
  {
    "key": "deur",
    "nl": "Deur",
    "fr": "Porte",
    "icon": "https://res.cloudinary.com/dbjizykvb/image/upload/v1786751139/deur_appxxk.png",
    "subcategories": []
  },
  {
    "key": "knutselen",
    "nl": "Knutselen",
    "fr": "Bricolage créatif",
    "icon": "https://res.cloudinary.com/dbjizykvb/image/upload/v1786751160/knutsellen_ki4s7d.png",
    "subcategories": [
      {
        "key": "plakband",
        "nl": "Plakband",
        "fr": "Ruban adhésif"
      },
      {
        "key": "koord",
        "nl": "Koord",
        "fr": "Corde"
      },
      {
        "key": "knutselmateriaal",
        "nl": "Knutselmateriaal",
        "fr": "Matériel de bricolage"
      }
    ]
  },
  {
    "key": "expositiematerialen",
    "nl": "Expositiematerialen",
    "fr": "Matériel d'exposition",
    "icon": "https://res.cloudinary.com/dbjizykvb/image/upload/v1786751146/expositie_unslq6.png",
    "subcategories": [
      {
        "key": "vitrine",
        "nl": "Vitrine",
        "fr": "Vitrine"
      },
      {
        "key": "sokkel",
        "nl": "Sokkel",
        "fr": "Socle"
      },
      {
        "key": "kader",
        "nl": "Kader",
        "fr": "Cadre"
      },
      {
        "key": "raam",
        "nl": "Raam",
        "fr": "Fenêtre"
      },
      {
        "key": "poort",
        "nl": "Poort",
        "fr": "Portail"
      }
    ]
  },
  {
    "key": "trap",
    "nl": "Trap",
    "fr": "Escalier",
    "icon": "https://res.cloudinary.com/dbjizykvb/image/upload/v1786751176/trap_pi225x.png",
    "subcategories": []
  },
  {
    "key": "hobby",
    "nl": "Hobby",
    "fr": "Loisirs",
    "icon": "https://res.cloudinary.com/dbjizykvb/image/upload/v1786751151/hobby_hlexqn.png",
    "subcategories": [
      {
        "key": "spelletjes",
        "nl": "Spelletjes",
        "fr": "Jeux"
      },
      {
        "key": "sport_gerief",
        "nl": "Sport gerief",
        "fr": "Équipement sportif"
      }
    ]
  },
  {
    "key": "veiligheid",
    "nl": "Veiligheid",
    "fr": "Sécurité",
    "icon": "https://res.cloudinary.com/dbjizykvb/image/upload/v1786751180/veiligheid_kilrqm.png",
    "subcategories": [
      {
        "key": "beschermkledij",
        "nl": "Beschermkledij",
        "fr": "Vêtements de protection"
      },
      {
        "key": "kegels",
        "nl": "Kegels",
        "fr": "Cônes"
      },
      {
        "key": "heras",
        "nl": "Heras",
        "fr": "Clôtures Heras"
      },
      {
        "key": "nadar",
        "nl": "Nadar",
        "fr": "Barrières Nadar"
      },
      {
        "key": "brandblussers",
        "nl": "Brandblussers",
        "fr": "Extincteurs"
      },
      {
        "key": "signaletiek",
        "nl": "Signaletiek",
        "fr": "Signalétique"
      }
    ]
  },
  {
    "key": "opbergen",
    "nl": "Opbergen",
    "fr": "Rangement",
    "icon": "https://res.cloudinary.com/dbjizykvb/image/upload/v1786751162/opbergen_wcqkvp.png",
    "subcategories": [
      {
        "key": "werfzak",
        "nl": "Werfzak",
        "fr": "Sac de chantier"
      },
      {
        "key": "pallet",
        "nl": "Pallet",
        "fr": "Palette"
      },
      {
        "key": "bak",
        "nl": "Bak",
        "fr": "Bac"
      },
      {
        "key": "bidon",
        "nl": "Bidon",
        "fr": "Bidon"
      },
      {
        "key": "flight_case",
        "nl": "Flight-case",
        "fr": "Flight-case"
      }
    ]
  }
];
