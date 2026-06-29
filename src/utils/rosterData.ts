export interface Player {
  id: string;
  name: string;
  number: number;
  position: 'GK' | 'DF' | 'MF' | 'FW';
  subPosition: string;
  stats: {
    goals: number;
    assists: number;
    shots: number;
    passes: number;
    fouls: number;
    yellowCards: number;
    redCards: number;
  };
}

export interface TeamRoster {
  formation: string;
  players: Player[];
}

// Hardcoded real rosters for elite World Cup teams to guarantee maximum authenticity
const eliteRosters: Record<string, { formation: string; players: Omit<Player, 'id' | 'stats'>[] }> = {
  "Argentina": {
    formation: "4-3-3",
    players: [
      { name: "Emiliano Martínez", number: 23, position: "GK", subPosition: "GK" },
      { name: "Nahuel Molina", number: 26, position: "DF", subPosition: "RB" },
      { name: "Cristian Romero", number: 13, position: "DF", subPosition: "CB" },
      { name: "Nicolas Otamendi", number: 19, position: "DF", subPosition: "CB" },
      { name: "Nicolás Tagliafico", number: 3, position: "DF", subPosition: "LB" },
      { name: "Rodrigo De Paul", number: 7, position: "MF", subPosition: "RCM" },
      { name: "Enzo Fernández", number: 24, position: "MF", subPosition: "CM" },
      { name: "Alexis Mac Allister", number: 20, position: "MF", subPosition: "LCM" },
      { name: "Lionel Messi", number: 10, position: "FW", subPosition: "RW" },
      { name: "Julián Álvarez", number: 9, position: "FW", subPosition: "ST" },
      { name: "Ángel Di María", number: 11, position: "FW", subPosition: "LW" },
    ]
  },
  "France": {
    formation: "4-2-3-1",
    players: [
      { name: "Mike Maignan", number: 16, position: "GK", subPosition: "GK" },
      { name: "Jules Koundé", number: 5, position: "DF", subPosition: "RB" },
      { name: "Dayot Upamecano", number: 4, position: "DF", subPosition: "CB" },
      { name: "William Saliba", number: 17, position: "DF", subPosition: "CB" },
      { name: "Théo Hernandez", number: 22, position: "DF", subPosition: "LB" },
      { name: "Aurélien Tchouaméni", number: 8, position: "MF", subPosition: "LDM" },
      { name: "Adrien Rabiot", number: 14, position: "MF", subPosition: "RDM" },
      { name: "Ousmane Dembélé", number: 11, position: "FW", subPosition: "RAM" },
      { name: "Antoine Griezmann", number: 7, position: "MF", subPosition: "AM" },
      { name: "Kylian Mbappé", number: 10, position: "FW", subPosition: "LW" },
      { name: "Olivier Giroud", number: 9, position: "FW", subPosition: "ST" },
    ]
  },
  "Brazil": {
    formation: "4-3-3",
    players: [
      { name: "Alisson Becker", number: 1, position: "GK", subPosition: "GK" },
      { name: "Danilo", number: 2, position: "DF", subPosition: "RB" },
      { name: "Marquinhos", number: 3, position: "DF", subPosition: "CB" },
      { name: "Gabriel Magalhães", number: 4, position: "DF", subPosition: "CB" },
      { name: "Wendell", number: 6, position: "DF", subPosition: "LB" },
      { name: "Bruno Guimarães", number: 5, position: "MF", subPosition: "DM" },
      { name: "Lucas Paquetá", number: 8, position: "MF", subPosition: "RCM" },
      { name: "João Gomes", number: 15, position: "MF", subPosition: "LCM" },
      { name: "Raphinha", number: 11, position: "FW", subPosition: "RW" },
      { name: "Rodrygo", number: 10, position: "FW", subPosition: "ST" },
      { name: "Vinícius Júnior", number: 7, position: "FW", subPosition: "LW" },
    ]
  },
  "England": {
    formation: "4-2-3-1",
    players: [
      { name: "Jordan Pickford", number: 1, position: "GK", subPosition: "GK" },
      { name: "Kyle Walker", number: 2, position: "DF", subPosition: "RB" },
      { name: "John Stones", number: 5, position: "DF", subPosition: "CB" },
      { name: "Marc Guéhi", number: 6, position: "DF", subPosition: "CB" },
      { name: "Kieran Trippier", number: 12, position: "DF", subPosition: "LB" },
      { name: "Declan Rice", number: 4, position: "MF", subPosition: "LDM" },
      { name: "Kobbie Mainoo", number: 26, position: "MF", subPosition: "RDM" },
      { name: "Bukayo Saka", number: 7, position: "FW", subPosition: "RAM" },
      { name: "Jude Bellingham", number: 10, position: "MF", subPosition: "AM" },
      { name: "Phil Foden", number: 11, position: "FW", subPosition: "LAM" },
      { name: "Harry Kane", number: 9, position: "FW", subPosition: "ST" },
    ]
  },
  "Germany": {
    formation: "4-2-3-1",
    players: [
      { name: "Manuel Neuer", number: 1, position: "GK", subPosition: "GK" },
      { name: "Joshua Kimmich", number: 6, position: "DF", subPosition: "RB" },
      { name: "Antonio Rüdiger", number: 2, position: "DF", subPosition: "CB" },
      { name: "Jonathan Tah", number: 4, position: "DF", subPosition: "CB" },
      { name: "David Raum", number: 3, position: "DF", subPosition: "LB" },
      { name: "Robert Andrich", number: 23, position: "MF", subPosition: "LDM" },
      { name: "Toni Kroos", number: 8, position: "MF", subPosition: "RDM" },
      { name: "Jamal Musiala", number: 10, position: "FW", subPosition: "RAM" },
      { name: "Ilkay Gündogan", number: 21, position: "MF", subPosition: "AM" },
      { name: "Florian Wirtz", number: 17, position: "FW", subPosition: "LW" },
      { name: "Kai Havertz", number: 7, position: "FW", subPosition: "ST" },
    ]
  },
  "Spain": {
    formation: "4-3-3",
    players: [
      { name: "Unai Simón", number: 23, position: "GK", subPosition: "GK" },
      { name: "Dani Carvajal", number: 2, position: "DF", subPosition: "RB" },
      { name: "Robin Le Normand", number: 3, position: "DF", subPosition: "CB" },
      { name: "Aymeric Laporte", number: 14, position: "DF", subPosition: "CB" },
      { name: "Marc Cucurella", number: 24, position: "DF", subPosition: "LB" },
      { name: "Rodri", number: 16, position: "MF", subPosition: "DM" },
      { name: "Pedri", number: 20, position: "MF", subPosition: "RCM" },
      { name: "Fabián Ruiz", number: 8, position: "MF", subPosition: "LCM" },
      { name: "Lamine Yamal", number: 19, position: "FW", subPosition: "RW" },
      { name: "Álvaro Morata", number: 7, position: "FW", subPosition: "ST" },
      { name: "Nico Williams", number: 17, position: "FW", subPosition: "LW" },
    ]
  },
  "Portugal": {
    formation: "4-3-3",
    players: [
      { name: "Diogo Costa", number: 22, position: "GK", subPosition: "GK" },
      { name: "João Cancelo", number: 20, position: "DF", subPosition: "RB" },
      { name: "Rúben Dias", number: 4, position: "DF", subPosition: "CB" },
      { name: "Pepe", number: 3, position: "DF", subPosition: "CB" },
      { name: "Nuno Mendes", number: 19, position: "DF", subPosition: "LB" },
      { name: "João Palhinha", number: 6, position: "MF", subPosition: "DM" },
      { name: "Vitinha", number: 23, position: "MF", subPosition: "RCM" },
      { name: "Bruno Fernandes", number: 8, position: "MF", subPosition: "LCM" },
      { name: "Bernardo Silva", number: 10, position: "FW", subPosition: "RW" },
      { name: "Cristiano Ronaldo", number: 7, position: "FW", subPosition: "ST" },
      { name: "Rafael Leão", number: 17, position: "FW", subPosition: "LW" },
    ]
  }
};

export const getTeamRoster = (teamName: string): TeamRoster => {
  const normalized = Object.keys(eliteRosters).find(k => k.toLowerCase() === teamName.toLowerCase());
  if (normalized && eliteRosters[normalized]) {
    const data = eliteRosters[normalized];
    return {
      formation: data.formation,
      players: data.players.map((p, i) => ({
        id: `${teamName}-${i}`,
        ...p,
        stats: {
          goals: 0,
          assists: 0,
          shots: 0,
          passes: 0,
          fouls: 0,
          yellowCards: 0,
          redCards: 0,
        }
      }))
    };
  }

  // Fallback: Generate completely transparent player slots (no fake names)
  const formation = "4-3-3";
  const positions: { pos: 'GK' | 'DF' | 'MF' | 'FW'; sub: string }[] = [
    { pos: "GK", sub: "GK" },
    { pos: "DF", sub: "RB" },
    { pos: "DF", sub: "CB" },
    { pos: "DF", sub: "CB" },
    { pos: "DF", sub: "LB" },
    { pos: "MF", sub: "RCM" },
    { pos: "MF", sub: "CM" },
    { pos: "MF", sub: "LCM" },
    { pos: "FW", sub: "RW" },
    { pos: "FW", sub: "ST" },
    { pos: "FW", sub: "LW" },
  ];

  const players: Player[] = positions.map((slot, index) => {
    let number = index + 1;
    if (slot.pos === "GK") number = 1;
    else if (index === 9) number = 9;
    else if (index === 8) number = 10;
    else number = index + 2;

    const name = `${slot.pos} #${number}`;

    return {
      id: `${teamName}-${index}`,
      name,
      number,
      position: slot.pos,
      subPosition: slot.sub,
      stats: {
        goals: 0,
        assists: 0,
        shots: 0,
        passes: 0,
        fouls: 0,
        yellowCards: 0,
        redCards: 0
      }
    };
  });

  return { formation, players };
};
